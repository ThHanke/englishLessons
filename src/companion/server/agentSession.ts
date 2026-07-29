import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentDefinition,
  McpServerConfig,
  Options,
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { getSessionId, setSessionId } from "./sessionIndex.ts";
import type { SessionKey } from "./sessionIndex.ts";
import { createLessonArtifactServer } from "./artifactTools.ts";

/** Matches the key `mcpServers` is registered under in `startQuery` below -- referenced by name
 * (not redefined) from the exercise-builder subagent's own `mcpServers` list. */
const ARTIFACT_SERVER_NAME = "companion-artifacts";

/** Runs on Haiku instead of the main session's model: exercise items (sentences, options, pairs)
 * are mechanical once the type/competences/content are already decided by the main agent -- this
 * doesn't need the main model's reasoning budget, just a correct generate_exercise call. Cuts
 * cost on the highest-volume tool call (several per lesson) without touching lesson-spec/plan
 * drafting or vocabulary judgment calls, which stay on the main model. */
const EXERCISE_BUILDER_AGENT: AgentDefinition = {
  description:
    "Builds and saves ONE typed exercise (gap_fill, mcq, matching, error_correction, crossword, flashcards, reorder, mark_the_words, or word_search) via generate_exercise. Invoke once per exercise, after you've already decided its type, competenceIds, and items -- this agent calls the tool correctly, it doesn't redesign the exercise.",
  prompt:
    "You build exactly one exercise per invocation by calling generate_exercise with the type, title, competenceIds, and items you're given. Follow those parameters precisely -- the pedagogical decisions (type, scaffolding band, item content) were already made by the agent that invoked you. For gap_fill items, always include a hint (the base/prompt word) on every blank. Call generate_exercise once, then report back what was saved.",
  model: "haiku",
  tools: [`mcp__${ARTIFACT_SERVER_NAME}__generate_exercise`],
  mcpServers: [ARTIFACT_SERVER_NAME],
};

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

You have six tools for persisting lesson artifacts. Always confirm with the teacher before saving. Typical order: save_lesson_spec (the constraints) → save_lesson_plan (the structured plan body) → generate_exercise (one call per exercise) → find_new_vocabulary / generate_vocab_intro.

### save_lesson_spec
When the teacher approves the lesson's constraints (module, phase, focus competences, milestone context), save it with \`save_lesson_spec\`. Pass the full lesson-spec object. The \`class\` and \`date\` fields MUST match the current session — the tool rejects mismatches. Saved lesson-specs automatically update coverage tracking on the next calendar load.
- \`known_vocab_ref\`: MUST be \`<classId>@<moduleId>\` — the current session's class id, a literal \`@\`, then the module id from this lesson's placement (e.g. \`grade-7-realschule-2026@m1\`). Never a file path, and never invented — this is a lookup key into \`vocabulary/*.yaml\`, not a filename. The tool rejects a value that doesn't start with \`<classId>@\`.

### save_lesson_plan
Once you've drafted the actual pedagogical plan (not just the constraints), save it with \`save_lesson_plan\` — this is what renders as the teacher-facing lesson page. Parameters:
- \`class\` / \`date\`: MUST match the current session
- \`objectives\`: string array — what pupils will be able to do by the end
- \`stages\`: \`[{ name, durationMinutes, description }]\` — the timed structure (warm-up/review → input → guided practice → production → wrap-up is the usual shape; adapt to what the lesson actually needs). A degraded pace (slower module progress) should shorten the new-input stage and expand review, not silently keep the same split.
- \`differentiationNotes\`: how weaker/stronger pupils are supported differently (scaffolds, word banks, hint removal, etc.)
- \`exercisePlan\`: string array — one line per exercise you intend to build (type + a short description), a plan of intent before you actually call \`generate_exercise\` for each one

### generate_exercise — via the exercise-builder subagent
Decide the exercise's type, title, competenceIds, and items yourself (invoke \`eal-scaffold\`, \`error-correction-design\`, etc. as normal to design the content), then delegate the actual save to the \`exercise-builder\` subagent (the \`Agent\` tool) instead of calling \`generate_exercise\` directly — it runs on a cheaper model since calling the tool correctly needs no reasoning once you've already decided the content. Give it the fully-decided parameters in your prompt to it:
- \`type\`: one of "gap_fill", "mcq", "matching", "error_correction", "crossword", "flashcards", "reorder",
  "mark_the_words", "word_search"
- \`title\`: descriptive title (used in the filename)
- \`competenceIds\`: the bracketed competence IDs this exercise practices
- \`items\`: an array shaped for the chosen type —
  - \`gap_fill\`: \`{ sentence: string (blank marked "___"), blanks: [{ answer, position, hint }] }\` — always
    give a \`hint\` (the base/prompt word, e.g. "clean" for answer "is cleaned"). Without a hint the pupil
    doesn't know which word is even being asked for, and the checker only accepts that one exact answer
    string — a hint disambiguates intent so a plausible-but-different word choice doesn't just fail silently.
  - \`mcq\`: \`{ question, options: string[], correctIndex }\`
  - \`matching\`: \`{ left, right }\` pairs
  - \`error_correction\`: \`{ sentence, correction, errorType? }\` — invoke the \`error-correction-design\`
    skill first for realistic German→English transfer errors (one error per sentence). \`errorType\` is an
    optional A1 hint (e.g. "word order") — omit it for A2+ so students identify the error type themselves.
    Only the corrected-sentence step is auto-checked; the pupil-facing "find the mistake"/"explain why"
    steps are open-ended and never auto-graded.
  - \`crossword\`: \`{ word, clue }\` pairs — words are placed automatically (crossing where letters share);
    keep the word list short (5-8) since the layout is a simple greedy placement, not an optimizer.
  - \`flashcards\`: \`{ front, back }\` pairs — vocabulary review, self-rated ("Got it" / "Still learning"),
    not auto-graded (there's no wrong answer to a flip).
  - \`reorder\`: \`{ fragments: string[] (in correct final order), instruction? }\` — give fragments in the
    CORRECT order; the widget scrambles and re-checks them itself. Good for sentence/paragraph/storyboard
    sequencing.
  - \`mark_the_words\`: \`{ text, targetIndices: number[], instruction }\` — \`targetIndices\` are 0-based
    positions into \`text\` split on whitespace (so punctuation stays attached to its word — count carefully).
    Use for "click every past-tense verb"/"click every connector" style identification tasks.
  - \`word_search\`: \`{ word }\` list — words are placed automatically in a random grid (across/down only);
    keep the list short (6-10) so the grid stays a reasonable size.

One \`exercise-builder\` invocation per exercise. This renders a self-contained, self-checking worksheet and records it in the coverage ledger at "practiced" depth for each competence — this is what makes the exercise count as real coverage, not just a saved file.

### find_new_vocabulary / generate_vocab_intro
Before or after drafting exercises, call \`find_new_vocabulary\` (no parameters) to scan the lesson-spec plus everything already generated for this date and get back the words that are genuinely new — not yet in the class's known-vocabulary chain (\`known_vocab_ref\`). It's a mechanical scan, not a suggestion: trust its "new" list over your own guess about what pupils already know.

If there's new vocabulary worth pre-teaching, call \`generate_vocab_intro\` with:
- \`title\`: descriptive title
- \`words\`: \`[{ word, translation }]\` — supply the German translation yourself for each word you're including (there's no translation data in the repo; this is on you). Only include words from \`find_new_vocabulary\`'s list, not vocabulary that's already known.

This saves a glossary (word, translation, read-aloud button) and records it in the ledger at "introduced" depth — matching the pre-taught-glossary practice from the generation spec: genuinely new words are surfaced explicitly, never silently used inside an exercise.

### save_material
When you create homework, tests, or notes (not exercises — those go through \`generate_exercise\`), save each with \`save_material\`. Parameters:
- \`type\`: one of "homework", "test", "notes"
- \`title\`: descriptive title (used in the filename)
- \`content\`: the full material content
- \`format\`: "html" or "md"

Saved materials become available as lesson attachments at the saved file path.

## Pedagogical skills

Invoke these skills BEFORE generating content — they guide HOW you build exercises, plans, and assessments.

| Situation | Invoke skill |
|-----------|-------------|
| Creating ANY exercise | \`eal-scaffold\` — scaffold for German L1 learners, preserving cognitive demand |
| Planning a warm-up | \`retrieval-warm-up\` — structured 5-8 min retrieval practice from prior_covered |
| Designing a full lesson opening | \`lesson-opening\` — 8-12 min opening (retrieval + bridge + "I can...") |
| Error correction exercises | \`error-correction-design\` — realistic German→English transfer errors |
| Creating an exercise SET (multiple items) | \`difficulty-progression\` — sequence supported → guided → independent |
| Vocabulary is a lesson focus | \`vocab-teaching\` — Beck's Tier 1/2/3, explicit teaching targets |
| Dialogue, writing prompt, or mediation tasks | \`sentence-frames\` — CEFR-graded frames for productive skills |
| Creating a test or quiz | \`assessment-design\` — blueprint-before-items, competence × depth matrix |

**Workflow:** For a full lesson plan, invoke \`lesson-opening\` first (which itself invokes \`retrieval-warm-up\`), then \`eal-scaffold\` + \`difficulty-progression\` for exercises, and \`vocab-teaching\` if vocabulary is a focus. For assessments, invoke \`assessment-design\` and present the blueprint for teacher confirmation before generating items.`;

function buildQueryOptions(params: {
  cwd: string;
  resume?: string;
  mcpServers?: Record<string, McpServerConfig>;
}): Options {
  return {
    cwd: params.cwd,
    settingSources: SETTING_SOURCES,
    disallowedTools: DISALLOWED_TOOLS,
    // This is a headless server with no channel to answer an interactive permission prompt --
    // under the SDK's default permissionMode a tool call either hangs or silently gets skipped,
    // which is exactly what happened before this was added: a real session drafted a full lesson
    // in prose instead of ever calling save_lesson_spec/generate_exercise, because it had no way
    // to get a permission grant. Bypassing the prompt layer here doesn't weaken the security
    // boundary: Write/Edit/MultiEdit/NotebookEdit/Bash are already hard-blocked via
    // disallowedTools (KTD2/KTD10, the only enforcement mechanism that matters), so the only
    // tools left able to run are the sanctioned MCP ones this file registers.
    permissionMode: "bypassPermissions" as const,
    allowDangerouslySkipPermissions: true,
    agents: {
      "exercise-builder": EXERCISE_BUILDER_AGENT,
    },
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
  const { classId, date, slotId, prompt, cwd } = params;
  const storedSessionId = await getSessionId({ classId, date, slotId });
  const artifactServer = createLessonArtifactServer({ classId, date, slotId, repoRoot: cwd });
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

  await setSessionId({ classId, date, slotId, sessionId: result.session_id });

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
  const { classId, date, slotId, prompt, cwd } = params;
  const storedSessionId = await getSessionId({ classId, date, slotId });
  const artifactServer = createLessonArtifactServer({ classId, date, slotId, repoRoot: cwd });
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
  await setSessionId({ classId, date, slotId, sessionId });

  return { sessionId, startedFresh, notice };
}
