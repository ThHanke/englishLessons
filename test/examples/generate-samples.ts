/** Regenerates this directory's example artifacts from the real production renderers
 * (src/widgets/*, src/publish/buildSite.ts) -- run via:
 *   node --experimental-strip-types test/examples/generate-samples.ts
 * These are documentation/review examples, not test fixtures; nothing under src/ imports them. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderGapFillHtml } from "../../src/widgets/gapFill.ts";
import { renderMcqHtml } from "../../src/widgets/mcq.ts";
import { renderMatchingHtml } from "../../src/widgets/matching.ts";
import { buildSite } from "../../src/publish/buildSite.ts";

const repoRoot = new URL("../../", import.meta.url).pathname;
const outDir = new URL("./", import.meta.url).pathname;
const classId = "grade-7-realschule-2026";
const date = "2026-08-21";
const sampleRepoRoot = join(repoRoot, "tmp", "example-source-repo");
const artifactsDir = join(sampleRepoRoot, "artifacts", classId, date);
const plansDir = join(sampleRepoRoot, "plans", classId);
const materialsDir = join(artifactsDir, "materials");

mkdirSync(outDir, { recursive: true });
mkdirSync(materialsDir, { recursive: true });
mkdirSync(plansDir, { recursive: true });

const gapFillItems = [
  { sentence: "The classroom ___ every morning by the caretaker.", blanks: [{ answer: "is cleaned", position: 0 }] },
  { sentence: "Our books ___ from the library last week.", blanks: [{ answer: "were borrowed", position: 0 }] },
  { sentence: "This exercise ___ by all students tomorrow.", blanks: [{ answer: "will be finished", position: 0 }] },
];
const mcqItems = [
  { question: "Which sentence is in the passive voice?", options: [
    "The dog chased the cat.",
    "The cat was chased by the dog.",
    "The dog is chasing the cat.",
  ], correctIndex: 1 },
  { question: "Choose the correct passive form: 'They built this house in 1990.'", options: [
    "This house built in 1990.",
    "This house was built in 1990.",
    "This house is building in 1990.",
  ], correctIndex: 1 },
  { question: "Which auxiliary verb forms the passive voice?", options: ["do", "be", "have"], correctIndex: 1 },
];
const matchingPairs = [
  { left: "timetable", right: "Stundenplan" },
  { left: "homework", right: "Hausaufgabe" },
  { left: "break", right: "Pause" },
  { left: "caretaker", right: "Hausmeister" },
  { left: "exam", right: "Prüfung" },
];

// --- Standalone widget samples (open directly, no build step) ---
writeFileSync(join(outDir, "gap_fill-passive-voice.html"), renderGapFillHtml("Passive Voice: Everyday Routines", gapFillItems));
writeFileSync(join(outDir, "mcq-passive-voice.html"), renderMcqHtml("Passive Voice: Multiple Choice", mcqItems));
writeFileSync(join(outDir, "matching-vocab.html"), renderMatchingHtml("Match the Vocabulary: School Life", matchingPairs, 3));

// --- Same materials in a real artifacts/ layout + manifest.json, then a full built site/ ---
writeFileSync(join(materialsDir, "gap_fill-passive-voice.html"), renderGapFillHtml("Passive Voice: Everyday Routines", gapFillItems));
writeFileSync(join(materialsDir, "mcq-passive-voice.html"), renderMcqHtml("Passive Voice: Multiple Choice", mcqItems));
writeFileSync(join(materialsDir, "matching-vocab.html"), renderMatchingHtml("Match the Vocabulary: School Life", matchingPairs, 3));

writeFileSync(join(artifactsDir, "lesson-spec.json"), JSON.stringify({
  class: classId,
  date,
  school_week: 1,
  module: { id: "m1", title: "Back in school — who does what", week_in_module: 1, of: 9 },
  phase: "new_input",
  pace_factor: 1,
  pace_reason: "normal",
  focus_competences: [
    { id: "fk.g.passive", topic: "active and passive voice", mode: ["understand", "produce"] },
  ],
  content_field: { id: "c.school", text: "Freizeit; Schulsysteme; Kultur" },
  text_types: ["dialog"],
  milestone_context: { next: "test", in_slots: 27, assesses: ["fk.g.passive"] },
  prior_covered: [],
  cefr_target: "B1",
  known_vocab_ref: `${classId}@m1`,
  textbook_refs: [],
  suggested_exercise_types: ["gap_fill", "mcq", "matching"],
  curriculum_ref: "sa-sek-en-2019",
}, null, 2));

writeFileSync(join(artifactsDir, "manifest.json"), JSON.stringify({
  class: classId,
  date,
  materials: [
    { file: "materials/gap_fill-passive-voice.html", type: "gap_fill", title: "Passive Voice: Everyday Routines", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:00:00.000Z" },
    { file: "materials/mcq-passive-voice.html", type: "mcq", title: "Passive Voice: Multiple Choice", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:05:00.000Z" },
    { file: "materials/matching-vocab.html", type: "matching", title: "Match the Vocabulary: School Life", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:10:00.000Z" },
  ],
}, null, 2));

writeFileSync(join(plansDir, "class.yaml"), `name: ${classId}\n`);

buildSite({ repoRoot: sampleRepoRoot, outDir: join(outDir, "site") });

console.log("Standalone widget samples: test/examples/*.html");
console.log("Full built site sample:    test/examples/site/index.html");
