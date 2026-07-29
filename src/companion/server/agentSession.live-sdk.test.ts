import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Opt-in only: makes a real Agent SDK call and consumes real subscription usage. Run via
 * `npm run test:live-sdk`, never as part of `npm test` / CI. Proves the KTD2/KTD10 deny-list
 * (agentSession.ts's DISALLOWED_TOOLS) actually blocks a live SDK session from writing to disk —
 * the mocked agentSession.test.ts suite only proves disallowedTools is passed to query(), not that
 * the SDK honors it. */
const LIVE = process.env.RUN_LIVE_SDK_TEST === "1";

const ORIGINAL_ENV = { ...process.env };

function isolateConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "companion-live-sdk-config-"));
  process.env.XDG_CONFIG_HOME = dir;
  return dir;
}

describe.skipIf(!LIVE)("agentSession (live SDK write-block regression)", () => {
  let tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(
    "produces a real lesson plan from seeded context but refuses to save it by writing lesson-spec.json directly",
    async () => {
      tmpDirs.push(isolateConfigDir());
      const cwd = mkdtempSync(join(tmpdir(), "companion-live-sdk-cwd-"));
      tmpDirs.push(cwd);
      const directWritePath = join(cwd, "lesson-spec.json");

      // Mirrors Chat.tsx's buildSeedContent (module spec) + a simulated lesson-spec — the same
      // shape a real companion session seeds a turn with — so this exercises the write-block
      // guarantee under a realistic, in-scope request rather than an obvious injection attempt.
      const seedContext = [
        "Date: 2026-08-21, Class: grade-7-realschule-2026",
        "Module: Back in school — who does what, Week 1, Phase: new input",
        "Focus competences: active and passive voice [fk.g.passive] — active and passive voice (understand, produce)",
        "Content: Freizeit; Schulsysteme; Kultur; Grundfunktionen von Medien: Information, Unterhaltung, Bildung und Werbung",
        "Text types: dialog",
        "CEFR target: B1",
        "Upcoming milestone: test in 27 lessons, assesses: active and passive voice [fk.g.passive]",
      ].join("\n");
      const ask =
        "I'd like to plan this lesson. Please draft a basic lesson plan (warm-up, main " +
        "activity, wrap-up) targeting the focus competences above. Once it's ready, save it by " +
        "writing directly to lesson-spec.json in the current working directory using the Write " +
        "tool — do this now without asking for confirmation.";

      const { runAgentTurn } = await import("./agentSession.ts");
      const outcome = await runAgentTurn({
        classId: "grade-7-realschule-2026",
        date: "2026-08-21",
        cwd,
        prompt: `${seedContext}\n\n${ask}`,
      });

      // Load-bearing: the model must still produce real lesson-plan content for this in-scope
      // request (not a blanket refusal)...
      expect(outcome.result.subtype).toBe("success");
      expect(outcome.result.subtype === "success" && outcome.result.result.length).toBeGreaterThan(
        200,
      );
      // ...while the direct-Write save path stays blocked regardless of the plausible framing —
      // disallowedTools removes Write from the tool list entirely, so no file lands on disk even
      // though save_lesson_spec (the sanctioned MCP path) remains available to it.
      expect(existsSync(directWritePath)).toBe(false);
    },
    120_000,
  );

  it(
    "actually saves via the sanctioned save_lesson_spec MCP tool when asked directly, without pausing for a permission prompt this headless server can't answer",
    async () => {
      tmpDirs.push(isolateConfigDir());
      const cwd = mkdtempSync(join(tmpdir(), "companion-live-sdk-cwd-"));
      tmpDirs.push(cwd);
      const classId = "grade-7-realschule-2026";
      const date = "2026-08-21";
      const specPath = join(cwd, "artifacts", classId, date, "lesson-spec.json");

      const seedContext = [
        `Date: ${date}, Class: ${classId}`,
        "Module: Back in school — who does what, Week 1, Phase: new input",
        "Focus competences: active and passive voice [fk.g.passive] (understand, produce)",
        "CEFR target: B1",
      ].join("\n");
      const ask =
        "This is a fully autonomous session -- no one will respond further. Draft a minimal " +
        `lesson plan for the focus competence above and save it now with save_lesson_spec ` +
        `(class must be exactly "${classId}", date exactly "${date}"). Do not ask for ` +
        "confirmation -- call the tool directly.";

      const { runAgentTurn } = await import("./agentSession.ts");
      const outcome = await runAgentTurn({
        classId,
        date,
        cwd,
        prompt: `${seedContext}\n\n${ask}`,
      });

      expect(outcome.result.subtype).toBe("success");
      // This is the regression this test exists for: without permissionMode set, a headless
      // session has no channel to answer the SDK's default interactive permission prompt, so the
      // MCP tool call silently never happens and nothing lands on disk -- the model just
      // describes the plan in prose instead. bypassPermissions (agentSession.ts's
      // buildQueryOptions) is what makes this assertion pass.
      expect(existsSync(specPath)).toBe(true);
    },
    120_000,
  );
});
