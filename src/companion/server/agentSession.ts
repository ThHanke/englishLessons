import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { getSessionId, setSessionId } from './sessionIndex.ts';
import type { SessionKey } from './sessionIndex.ts';

/** KTD2/KTD10: `allowedTools` doesn't gate built-in tools at all, so this deny-list is the only
 * enforcement mechanism for R8's read-only guarantee. Every version bump of the Agent SDK
 * dependency must re-check this list against that version's built-in write-capable tools. */
export const DISALLOWED_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'];

/** KTD4: skills under `.claude/skills/*` don't load without `settingSources`, even with `Skill`
 * in `allowedTools`. Required for R3's "exactly as under Claude Code" guarantee. */
const SETTING_SOURCES: NonNullable<Options['settingSources']> = ['user', 'project'];

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

/**
 * Runs one Agent SDK turn for a class+date, resuming that date's session (KTD3) when the index
 * has one. If resume fails (KTD8-adjacent: this is not the write-block degrade-gracefully case,
 * it's a broken/missing transcript), starts a fresh session with a notice rather than surfacing
 * the raw SDK error to the caller.
 */
export async function runAgentTurn(params: AgentTurnParams): Promise<AgentTurnResult> {
  const { classId, date, prompt, cwd } = params;
  const storedSessionId = await getSessionId({ classId, date });

  let result: SDKResultMessage;
  let startedFresh = false;
  let notice: string | undefined;

  if (storedSessionId) {
    try {
      result = await runQuery({ prompt, cwd, resume: storedSessionId });
    } catch (err) {
      startedFresh = true;
      notice =
        `Could not resume the prior conversation for this date (its saved session history may be missing ` +
        `or corrupted); starting a fresh session instead. (${(err as Error).message})`;
      result = await runQuery({ prompt, cwd });
    }
  } else {
    result = await runQuery({ prompt, cwd });
  }

  await setSessionId({ classId, date, sessionId: result.session_id });

  return { sessionId: result.session_id, result, startedFresh, notice };
}

async function runQuery(params: { prompt: string; cwd: string; resume?: string }): Promise<SDKResultMessage> {
  const options: Options = {
    cwd: params.cwd,
    settingSources: SETTING_SOURCES,
    disallowedTools: DISALLOWED_TOOLS,
    ...(params.resume ? { resume: params.resume } : {}),
  };

  let resultMessage: SDKResultMessage | undefined;
  // KTD8: a denied write tool-result arrives as an ordinary message in this stream, not a
  // thrown error. Iterate everything and only capture the terminal 'result' message -- a
  // permission denial mid-conversation never stops this loop early.
  for await (const message of query({ prompt: params.prompt, options })) {
    if (message.type === 'result') {
      resultMessage = message;
    }
  }

  if (!resultMessage) {
    throw new Error('Agent SDK query completed without a result message.');
  }
  return resultMessage;
}
