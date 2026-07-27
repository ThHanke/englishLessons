import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  McpServerConfig,
  Options,
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { getSessionId, setSessionId } from "./sessionIndex.ts";
import type { SessionKey } from "./sessionIndex.ts";
import { createLessonArtifactServer } from "./artifactTools.ts";

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

const COMPANION_INSTRUCTIONS = `You are an English-teaching companion for a German secondary school teacher (Gymnasium and Realschule, grades 5-8, Sachsen-Anhalt curriculum).

## Scope — single lesson only
You work on exactly ONE lesson at a time: the date the teacher selected. You receive that lesson's context (module, phase, coverage gaps, existing lesson-spec). You cannot see or plan other lessons in the module. Do not suggest planning a sequence of lessons, building a coverage calendar, or reorganizing the module timeline — those are outside your scope.

## What you can do
Offer these options when a conversation starts:

1. **Create lesson plan** — 45-minute structure (warm-up, main activity, wrap-up) targeting the coverage gaps and CEFR level for this date. Address gaps by priority: at-risk > not yet covered > needs more depth.
2. **Create exercises / worksheets** — practice activities for specific competences. Provide ready-to-use items (gap-fills, role-plays, matching, etc.) with example sentences and word banks.
3. **Create homework** — take-home tasks reinforcing what was practiced in class.
4. **Create test / quiz** — assessment items aligned with the upcoming milestone and the competences it assesses.
5. **Review existing plan** — if a lesson-spec already exists, review it and suggest improvements.

Materials you create will be published as links attached to this lesson date.

## Competence IDs and progress tracking
The seed context includes competence IDs in brackets like [fk.g.simple_present]. Always use human-readable names when talking to the teacher (e.g. "Grammar: Simple Present" not "fk.g.simple_present"). But when you reference competences in structured output or progress updates, include the bracketed ID so the framework can track coverage.

## How to work
- Read \`plans/<grade>/modules.yaml\` for module goals, covers[], and pedagogy when you need more detail.
- Check \`plans/<grade>/vocabulary.yaml\` for the controlled word list.
- Reference textbook citations from the lesson-spec when available.
- Age-appropriate: grade 5 (~10 yrs, beginners A1), grade 7-8 (~13-14, intermediate A2-B1).
- State target competences and CEFR level for every activity you propose.
- Keep exercises concrete: example sentences, word banks, prompts the teacher can use directly.

## Response style
Practical and concrete. Teachers need usable material, not theory. Lesson plans get structured outlines with timing. Exercises get ready-to-use items.

Start each conversation by briefly acknowledging the lesson context (date, module, phase, key gaps) and offering the numbered options above. Let the teacher choose.

## Saving your work

You have two tools for persisting lesson artifacts. Always confirm with the teacher before saving.

### save_lesson_spec
When the teacher approves a lesson plan, save it with \`save_lesson_spec\`. Pass the full lesson-spec object. The \`class\` and \`date\` fields MUST match the current session — the tool rejects mismatches. Saved lesson-specs automatically update coverage tracking on the next calendar load.

### save_material
When you create exercises, homework, tests, or notes, save each with \`save_material\`. Parameters:
- \`type\`: one of "exercise", "homework", "test", "notes"
- \`title\`: descriptive title (used in the filename)
- \`content\`: the full material content
- \`format\`: "html" or "md"

Saved materials become available as lesson attachments at the saved file path.`;

function buildQueryOptions(params: {
  cwd: string;
  resume?: string;
  mcpServers?: Record<string, McpServerConfig>;
}): Options {
  return {
    cwd: params.cwd,
    settingSources: SETTING_SOURCES,
    disallowedTools: DISALLOWED_TOOLS,
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: COMPANION_INSTRUCTIONS,
    },
    ...(params.resume ? { resume: params.resume } : {}),
    ...(params.mcpServers ? { mcpServers: params.mcpServers } : {}),
  };
}

/** Shared entry point into the Agent SDK's `query()` call -- both the buffered (`runAgentTurn`)
 * and streaming (`runAgentTurnStream`) paths start here so their `cwd`/`settingSources`/
 * `disallowedTools`/`resume` option-building never drifts apart. */
function startQuery(params: {
  prompt: string;
  cwd: string;
  resume?: string;
  mcpServers?: Record<string, McpServerConfig>;
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
  const artifactServer = createLessonArtifactServer({ classId, date, repoRoot: cwd });
  const mcpServers: Record<string, McpServerConfig> = {
    "companion-artifacts": artifactServer,
  };

  let result: SDKResultMessage;
  let startedFresh = false;
  let notice: string | undefined;

  if (storedSessionId) {
    try {
      result = await drainToResult(
        startQuery({ prompt, cwd, resume: storedSessionId, mcpServers }),
      );
    } catch (err) {
      startedFresh = true;
      notice = resumeFailureNotice(err);
      result = await drainToResult(startQuery({ prompt, cwd, mcpServers }));
    }
  } else {
    result = await drainToResult(startQuery({ prompt, cwd, mcpServers }));
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
  const artifactServer = createLessonArtifactServer({ classId, date, repoRoot: cwd });
  const mcpServers: Record<string, McpServerConfig> = {
    "companion-artifacts": artifactServer,
  };

  let sessionId: string | undefined;
  let startedFresh = false;
  let notice: string | undefined;

  async function* forward(resume?: string): AsyncGenerator<SDKMessage> {
    for await (const message of startQuery({ prompt, cwd, resume, mcpServers })) {
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
