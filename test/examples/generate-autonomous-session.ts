/**
 * Runs a REAL, fully autonomous Claude Agent SDK lesson-planning session (no teacher input beyond
 * the initial prompt -- every decision, including what to save, is the model's own) through the
 * production tool-call path (src/companion/server/agentSession.ts's runAgentTurn, same code the
 * companion app uses), then renders the result as one consolidated example page with every
 * exercise embedded inline (src/publish/renderInlineLessonPage.ts).
 *
 * Costs real Claude subscription usage and can take several minutes (many tool calls in one
 * buffered turn). Opt-in only -- run via:
 *   AUTONOMOUS_SESSION=1 node --experimental-strip-types test/examples/generate-autonomous-session.ts
 *
 * Runs with cwd = the real repo root, so .claude/skills/ (project-scope skill lookup) and the
 * real plans/vocabulary/ data are available to the model exactly as in production -- but against
 * a reserved, never-real date (2099-01-01) so nothing collides with an actual scheduled lesson.
 * The real artifacts/ directory this run writes into is deleted again once its output is copied
 * into test/examples/ -- nothing from this demo run is meant to remain in the working tree
 * outside test/examples/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runAgentTurn } from "../../src/companion/server/agentSession.ts";
import { renderInlineLessonPage } from "../../src/publish/renderInlineLessonPage.ts";
import type { LessonSpec } from "../../src/schema/types.ts";
import type { Manifest } from "../../src/publish/renderLessonPage.ts";

if (process.env.AUTONOMOUS_SESSION !== "1") {
  console.error(
    "This makes a real Claude Agent SDK call (costs subscription usage, can take several minutes).",
  );
  console.error(
    "Run: AUTONOMOUS_SESSION=1 node --experimental-strip-types test/examples/generate-autonomous-session.ts",
  );
  process.exit(1);
}

const repoRoot = new URL("../../", import.meta.url).pathname;
const outDir = new URL("./", import.meta.url).pathname;
const classId = "grade-7-realschule-2026";
const date = "2099-01-01"; // reserved, never a real scheduled date
const artifactsDir = join(repoRoot, "artifacts", classId, date);

const seedContext = [
  `Date: ${date}, Class: ${classId}`,
  "Module: Back in school — who does what, Week 1, Phase: new_input",
  "Focus competences: active and passive voice [fk.g.passive] (understand, produce)",
  "Content: Freizeit; Schulsysteme; Kultur; Grundfunktionen von Medien: Information, Unterhaltung, Bildung und Werbung",
  "Text types: dialog",
  "CEFR target: B1",
  `Known vocabulary ref: ${classId}@m1`,
  "Upcoming milestone: test in 20 lessons, assesses: active and passive voice [fk.g.passive]",
].join("\n");

const instructions = [
  "This is a fully autonomous lesson-planning session: the teacher will not respond further in " +
    "this conversation. Make every decision yourself and proceed directly through drafting AND " +
    "saving every artifact -- do not pause to ask for confirmation at any step.",
  "",
  `1. Draft a full 45-minute lesson plan and save it with save_lesson_spec (class must be exactly "${classId}", date exactly "${date}").`,
  "2. Create a well-rounded set of exercises with generate_exercise to practice the focus " +
    "competences -- decide the types, count, and content yourself, invoking whichever " +
    "pedagogical skills you'd normally use (eal-scaffold, difficulty-progression, " +
    "error-correction-design, etc.).",
  "3. Call find_new_vocabulary, and if it finds anything worth pre-teaching, call " +
    "generate_vocab_intro with your own German translations.",
  "",
  "Proceed end to end now.",
].join("\n");

console.log(`Starting autonomous session for ${classId} / ${date}...`);
const outcome = await runAgentTurn({
  classId,
  date,
  cwd: repoRoot,
  prompt: `${seedContext}\n\n${instructions}`,
});

if (outcome.result.subtype !== "success") {
  console.error("Session did not complete successfully:", JSON.stringify(outcome.result, null, 2));
  process.exit(1);
}
console.log("Session complete. Final assistant message:\n", outcome.result.result);

if (!existsSync(artifactsDir)) {
  console.error(`No artifacts were written to ${artifactsDir} -- the model didn't save anything.`);
  process.exit(1);
}

const specPath = join(artifactsDir, "lesson-spec.json");
if (!existsSync(specPath)) {
  console.error("No lesson-spec.json was saved.");
  process.exit(1);
}
const spec = JSON.parse(readFileSync(specPath, "utf-8")) as LessonSpec;

const manifestPath = join(artifactsDir, "manifest.json");
const manifest: Manifest | null = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest)
  : null;

const materialsDir = join(artifactsDir, "materials");
const materials = existsSync(materialsDir)
  ? readdirSync(materialsDir)
      .filter((f) => f.endsWith(".html"))
      .sort()
      .map((file) => ({ file, html: readFileSync(join(materialsDir, file), "utf-8") }))
  : [];

const inlineHtml = renderInlineLessonPage({ spec, manifest, materials });
writeFileSync(join(outDir, "full-lesson-plan-autonomous.html"), inlineHtml);

// Also keep the raw, unprocessed session output for transparency/inspection.
const rawDir = join(outDir, "autonomous-session-raw");
rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });
writeFileSync(join(rawDir, "lesson-spec.json"), JSON.stringify(spec, null, 2));
if (manifest) writeFileSync(join(rawDir, "manifest.json"), JSON.stringify(manifest, null, 2));
if (materials.length > 0) {
  mkdirSync(join(rawDir, "materials"), { recursive: true });
  for (const m of materials) writeFileSync(join(rawDir, "materials", m.file), m.html);
}
writeFileSync(
  join(rawDir, "session-transcript.md"),
  [
    "# Autonomous planning session transcript",
    "",
    "## Seed prompt",
    "```",
    `${seedContext}\n\n${instructions}`,
    "```",
    "",
    "## Final assistant message",
    outcome.result.result,
  ].join("\n"),
);

// This script writes into the REAL repo's artifacts/ directory (cwd = repo root, so
// .claude/skills/ and real plans/vocabulary/ data are available to the model) -- nothing from
// this demo run should remain there once copied into test/examples/. Also removes the now-empty
// artifacts/<classId>/ and artifacts/ parent directories rmSync leaves behind (git doesn't track
// empty directories, but a stray one left on disk is untidy for the next run/contributor).
rmSync(artifactsDir, { recursive: true, force: true });
for (const dir of [join(repoRoot, "artifacts", classId), join(repoRoot, "artifacts")]) {
  if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}

console.log("Wrote test/examples/full-lesson-plan-autonomous.html");
console.log("Wrote test/examples/autonomous-session-raw/ (unprocessed lesson-spec.json/manifest.json/materials/)");
