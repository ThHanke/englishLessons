import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  Options,
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { getSessionId, setSessionId } from "./sessionIndex.ts";
import type { SessionKey } from "./sessionIndex.ts";

/** KTD2/KTD10: `allowedTools` doesn't gate built-in tools at all, so this deny-list is the only
 * enforcement mechanism for R8's read-only guarantee. Every version bump of the Agent SDK
 * dependency must re-check this list against that version's built-in write-capable tools. */
export const DISALLOWED_TOOLS = [
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "Bash",
];

/** KTD4: skills under `.claude/skills/*` don't load without `settingSources`, even with `Skill`
 * in `allowedTools`. Required for R3's "exactly as under Claude Code" guarantee. */
const SETTING_SOURCES: NonNullable<Options["settingSources"]> = [
  "user",
  "project",
];

export type AgentTurnParams = SessionKey & {
  prompt: string;
  cwd: string;
};

export type AgentTurnResult = {
  sessionId: string;
  result: SDKResultMessage;
  /** True when a stored session id existed but resuming it failed (e.g. missing/corrupted SDK
   * transcript) and a fresh session had to be started instead. */
  startedFresh: boolean;
  /** Set alongside startedFresh: a teacher-facing notice that prior history was lost. */
  notice?: string;
};

/** Final value of `runAgentTurnStream`'s async generator once its underlying SDK stream is fully
 * consumed: the same resolved-session-id/fallback metadata `AgentTurnResult` carries, without
 * smuggling a synthetic message type into the `SDKMessage` stream itself. */
export type AgentTurnStreamResult = {
  sessionId: string;
  startedFresh: boolean;
  notice?: string;
};

function buildQueryOptions(params: { cwd: string; resume?: string }): Options {
  return {
    cwd: params.cwd,
    settingSources: SETTING_SOURCES,
    disallowedTools: DISALLOWED_TOOLS,
    ...(params.resume ? { resume: params.resume } : {}),
  };
}

/** Shared entry point into the Agent SDK's `query()` call -- both the buffered (`runAgentTurn`)
 * and streaming (`runAgentTurnStream`) paths start here so their `cwd`/`settingSources`/
 * `disallowedTools`/`resume` option-building never drifts apart. */
function startQuery(params: {
  prompt: string;
  cwd: string;
  resume?: string;
}): AsyncGenerator<SDKMessage> {
  const options = buildQueryOptions(params);
  return query({
    prompt: params.prompt,
    options,
  }) as AsyncGenerator<SDKMessage>;
}

function resumeFailureNotice(err: unknown): string {
  return (
    `Could not resume the prior conversation for this date (its saved session history may be missing ` +
    `or corrupted); starting a fresh session instead. (${(err as Error).message})`
  );
}

/**
 * Runs one Agent SDK turn for a class+date, resuming that date's session (KTD3) when the index
 * has one. If resume fails (KTD8-adjacent: this is not the write-block degrade-gracefully case,
 * it's a broken/missing transcript), starts a fresh session with a notice rather than surfacing
 * the raw SDK error to the caller.
 *
 * Fully buffered: consumes the entire message stream internally and only resolves after the
 * terminal 'result' message. Use `runAgentTurnStream` when a caller needs incremental output
 * (e.g. to forward over a streamed HTTP response) instead of one buffered reply.
 */
export async function runAgentTurn(
  params: AgentTurnParams,
): Promise<AgentTurnResult> {
  const { classId, date, prompt, cwd } = params;
  const storedSessionId = await getSessionId({ classId, date });

  let result: SDKResultMessage;
  let startedFresh = false;
  let notice: string | undefined;

  if (storedSessionId) {
    try {
      result = await drainToResult(
        startQuery({ prompt, cwd, resume: storedSessionId }),
      );
    } catch (err) {
      startedFresh = true;
      notice = resumeFailureNotice(err);
      result = await drainToResult(startQuery({ prompt, cwd }));
    }
  } else {
    result = await drainToResult(startQuery({ prompt, cwd }));
  }

  await setSessionId({ classId, date, sessionId: result.session_id });

  return { sessionId: result.session_id, result, startedFresh, notice };
}

async function drainToResult(
  stream: AsyncGenerator<SDKMessage>,
): Promise<SDKResultMessage> {
  let resultMessage: SDKResultMessage | undefined;
  // KTD8: a denied write tool-result arrives as an ordinary message in this stream, not a
  // thrown error. Iterate everything and only capture the terminal 'result' message -- a
  // permission denial mid-conversation never stops this loop early.
  for await (const message of stream) {
    if (message.type === "result") {
      resultMessage = message;
    }
  }

  if (!resultMessage) {
    throw new Error("Agent SDK query completed without a result message.");
  }
  return resultMessage;
}

/**
 * Streaming counterpart to `runAgentTurn`: yields every `SDKMessage` as the Agent SDK produces
 * it, instead of buffering until the terminal 'result' message -- for a caller (the `/api/chat`
 * route) that needs to forward incremental assistant output over HTTP rather than send one
 * buffered response. Shares `buildQueryOptions`/`startQuery` with `runAgentTurn`, so it carries
 * the exact same `cwd`/`settingSources`/`disallowedTools` options, the same
 * resume-with-stored-id-or-fresh logic, and the same "write the final session_id back to the
 * index" step.
 *
 * Resume-failure fallback mirrors `runAgentTurn`: if resuming a stored session id throws (broken
 * or missing transcript), this catches it and continues by yielding from a fresh session instead
 * -- any messages the broken resume attempt already yielded before failing are still forwarded
 * to the caller (in practice, and per the SDK's documented behavior for this failure mode, a
 * broken resume fails before yielding anything).
 */
export async function* runAgentTurnStream(
  params: AgentTurnParams,
): AsyncGenerator<SDKMessage, AgentTurnStreamResult> {
  const { classId, date, prompt, cwd } = params;
  const storedSessionId = await getSessionId({ classId, date });

  let sessionId: string | undefined;
  let startedFresh = false;
  let notice: string | undefined;

  async function* forward(resume?: string): AsyncGenerator<SDKMessage> {
    for await (const message of startQuery({ prompt, cwd, resume })) {
      if (message.type === "result") {
        sessionId = message.session_id;
      }
      yield message;
    }
  }

  if (storedSessionId) {
    try {
      yield* forward(storedSessionId);
    } catch (err) {
      startedFresh = true;
      notice = resumeFailureNotice(err);
      yield* forward(undefined);
    }
  } else {
    yield* forward(undefined);
  }

  if (!sessionId) {
    throw new Error("Agent SDK query completed without a result message.");
  }
  await setSessionId({ classId, date, sessionId });

  return { sessionId, startedFresh, notice };
}
