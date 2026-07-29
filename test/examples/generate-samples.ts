/** Regenerates this directory's example artifacts from the real production renderers
 * (src/widgets/*, src/publish/buildSite.ts) -- run via:
 *   node --experimental-strip-types test/examples/generate-samples.ts
 * These are documentation/review examples, not test fixtures; nothing under src/ imports them. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderGapFillHtml } from "../../src/widgets/gapFill.ts";
import { renderMcqHtml } from "../../src/widgets/mcq.ts";
import { renderMatchingHtml } from "../../src/widgets/matching.ts";
import { renderErrorCorrectionHtml } from "../../src/widgets/errorCorrection.ts";
import { renderCrosswordHtml } from "../../src/widgets/crossword.ts";
import { renderFlashcardsHtml } from "../../src/widgets/flashcards.ts";
import { renderReorderHtml } from "../../src/widgets/reorder.ts";
import { renderMarkTheWordsHtml } from "../../src/widgets/markTheWords.ts";
import { renderWordSearchHtml } from "../../src/widgets/wordSearch.ts";
import { renderVocabIntroHtml } from "../../src/widgets/vocabIntro.ts";
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
  { sentence: "The classroom ___ every morning by the caretaker.", blanks: [{ answer: "is cleaned", position: 0, hint: "clean" }] },
  { sentence: "Our books ___ from the library last week.", blanks: [{ answer: "were borrowed", position: 0, hint: "borrow" }] },
  { sentence: "This exercise ___ by all students tomorrow.", blanks: [{ answer: "will be finished", position: 0, hint: "finish" }] },
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
const errorCorrectionItems = [
  { sentence: "Yesterday went I to school.", correction: "Yesterday I went to school.", errorType: "word order" },
  { sentence: "Look! It rains.", correction: "Look! It is raining.", errorType: "no progressive aspect" },
  { sentence: "I live here since 2020.", correction: "I have lived here since 2020.", errorType: "tense" },
];
const crosswordItems = [
  { word: "TIMETABLE", clue: "Shows when each lesson happens (Stundenplan)" },
  { word: "HOMEWORK", clue: "Work done at home for school" },
  { word: "BREAK", clue: "A short pause between lessons" },
  { word: "EXAM", clue: "A formal test" },
];
const vocabWords = [
  { word: "caretaker", translation: "Hausmeister" },
  { word: "borrow", translation: "ausleihen" },
  { word: "finish", translation: "beenden" },
];
const flashcardItems = [
  { front: "timetable", back: "Stundenplan" },
  { front: "homework", back: "Hausaufgabe" },
  { front: "caretaker", back: "Hausmeister" },
];
const reorderItems = [
  {
    fragments: [
      "First, the caretaker unlocks the classroom.",
      "Then, the students arrive and sit down.",
      "Finally, the lesson begins.",
    ],
    instruction: "Put the morning routine in the correct order.",
  },
];
const markTheWordsItems = [
  {
    text: "The classroom was cleaned yesterday and the books were borrowed last week.",
    targetIndices: [3, 9], // "cleaned", "borrowed" -- the passive-voice past participles
    instruction: "Click every passive-voice past participle.",
  },
];
const wordSearchItems = [
  { word: "TIMETABLE" },
  { word: "HOMEWORK" },
  { word: "BREAK" },
  { word: "EXAM" },
  { word: "CARETAKER" },
];

// --- Standalone widget samples (open directly, no build step) ---
writeFileSync(join(outDir, "gap_fill-passive-voice.html"), renderGapFillHtml("Passive Voice: Everyday Routines", gapFillItems));
writeFileSync(join(outDir, "mcq-passive-voice.html"), renderMcqHtml("Passive Voice: Multiple Choice", mcqItems));
writeFileSync(join(outDir, "matching-vocab.html"), renderMatchingHtml("Match the Vocabulary: School Life", matchingPairs, 3));
writeFileSync(join(outDir, "error_correction-passive-voice.html"), renderErrorCorrectionHtml("Find the Mistake: Tense & Word Order", errorCorrectionItems));
writeFileSync(join(outDir, "crossword-school-vocab.html"), renderCrosswordHtml("School Life Crossword", crosswordItems));
writeFileSync(join(outDir, "flashcards-school-vocab.html"), renderFlashcardsHtml("School Vocab Flashcards", flashcardItems));
writeFileSync(join(outDir, "reorder-morning-routine.html"), renderReorderHtml("Morning Routine: Put It in Order", reorderItems));
writeFileSync(join(outDir, "mark_the_words-passive-voice.html"), renderMarkTheWordsHtml("Find the Passive Voice", markTheWordsItems));
writeFileSync(join(outDir, "word_search-school-vocab.html"), renderWordSearchHtml("School Vocab Word Search", wordSearchItems, 1));
writeFileSync(join(outDir, "vocab_intro-new-words.html"), renderVocabIntroHtml("New Vocabulary: Back in School", vocabWords));

// --- Same materials in a real artifacts/ layout + manifest.json, then a full built site/ ---
writeFileSync(join(materialsDir, "gap_fill-passive-voice.html"), renderGapFillHtml("Passive Voice: Everyday Routines", gapFillItems));
writeFileSync(join(materialsDir, "mcq-passive-voice.html"), renderMcqHtml("Passive Voice: Multiple Choice", mcqItems));
writeFileSync(join(materialsDir, "matching-vocab.html"), renderMatchingHtml("Match the Vocabulary: School Life", matchingPairs, 3));
writeFileSync(join(materialsDir, "error_correction-passive-voice.html"), renderErrorCorrectionHtml("Find the Mistake: Tense & Word Order", errorCorrectionItems));
writeFileSync(join(materialsDir, "crossword-school-vocab.html"), renderCrosswordHtml("School Life Crossword", crosswordItems));
writeFileSync(join(materialsDir, "flashcards-school-vocab.html"), renderFlashcardsHtml("School Vocab Flashcards", flashcardItems));
writeFileSync(join(materialsDir, "reorder-morning-routine.html"), renderReorderHtml("Morning Routine: Put It in Order", reorderItems));
writeFileSync(join(materialsDir, "mark_the_words-passive-voice.html"), renderMarkTheWordsHtml("Find the Passive Voice", markTheWordsItems));
writeFileSync(join(materialsDir, "word_search-school-vocab.html"), renderWordSearchHtml("School Vocab Word Search", wordSearchItems, 1));
writeFileSync(join(materialsDir, "vocab_intro-new-words.html"), renderVocabIntroHtml("New Vocabulary: Back in School", vocabWords));

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
  suggested_exercise_types: [
    "gap_fill", "mcq", "matching", "error_correction", "crossword",
    "flashcards", "reorder", "mark_the_words", "word_search",
  ],
  curriculum_ref: "sa-sek-en-2019",
}, null, 2));

writeFileSync(join(artifactsDir, "lesson-plan.json"), JSON.stringify({
  objectives: [
    "Identify active vs passive voice in context",
    "Produce passive-voice sentences about school and media topics",
  ],
  stages: [
    { name: "Warm-up / Review", durationMinutes: 9, description: "Retrieval practice + German Passiv bridge; \"I can...\" on the board" },
    { name: "Input", durationMinutes: 10, description: "Dialog with passive-voice sentences in context; underline be+past-participle" },
    { name: "Guided Practice", durationMinutes: 20, description: "Gap fill (supported), MCQ + matching (guided)" },
    { name: "Production", durationMinutes: 5, description: "Error correction (independent, no hints)" },
    { name: "Wrap-up", durationMinutes: 1, description: "Exit ticket: one passive sentence about school" },
  ],
  differentiationNotes: "Band 1 gets a full word bank and base-verb hints; Band 2 drops the word bank; Band 3 (error correction) gets no hints at all, per B1 expectations.",
  exercisePlan: [
    "gap_fill: 3 sentences, supported band, hints given",
    "mcq: 3 items, guided band, no word bank",
    "matching: 5 vocab pairs, guided band",
    "error_correction: 3 German L1 transfer errors, independent band",
    "crossword: 4 vocab items, recall/spelling practice",
    "flashcards: 3 vocab pairs, self-rated review",
    "reorder: morning-routine sentences, sequencing practice",
    "mark_the_words: passive-voice identification in a short passage",
    "word_search: 5 vocab items, recall/spelling practice",
  ],
}, null, 2));

writeFileSync(join(artifactsDir, "manifest.json"), JSON.stringify({
  class: classId,
  date,
  materials: [
    { file: "materials/gap_fill-passive-voice.html", type: "gap_fill", title: "Passive Voice: Everyday Routines", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:00:00.000Z" },
    { file: "materials/mcq-passive-voice.html", type: "mcq", title: "Passive Voice: Multiple Choice", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:05:00.000Z" },
    { file: "materials/matching-vocab.html", type: "matching", title: "Match the Vocabulary: School Life", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:10:00.000Z" },
    { file: "materials/error_correction-passive-voice.html", type: "error_correction", title: "Find the Mistake: Tense & Word Order", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:15:00.000Z" },
    { file: "materials/crossword-school-vocab.html", type: "crossword", title: "School Life Crossword", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:20:00.000Z" },
    { file: "materials/flashcards-school-vocab.html", type: "flashcards", title: "School Vocab Flashcards", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:25:00.000Z" },
    { file: "materials/reorder-morning-routine.html", type: "reorder", title: "Morning Routine: Put It in Order", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:30:00.000Z" },
    { file: "materials/mark_the_words-passive-voice.html", type: "mark_the_words", title: "Find the Passive Voice", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:35:00.000Z" },
    { file: "materials/word_search-school-vocab.html", type: "word_search", title: "School Vocab Word Search", competenceIds: ["fk.g.passive"], depth: "practiced", createdAt: "2026-08-21T10:40:00.000Z" },
    { file: "materials/vocab_intro-new-words.html", type: "vocab_intro", title: "New Vocabulary: Back in School", competenceIds: ["fk.g.passive"], depth: "introduced", createdAt: "2026-08-21T09:55:00.000Z" },
  ],
}, null, 2));

writeFileSync(join(plansDir, "class.yaml"), `name: ${classId}\n`);

buildSite({ repoRoot: sampleRepoRoot, outDir: join(outDir, "site") });

console.log("Standalone widget samples: test/examples/*.html");
console.log("Full built site sample:    test/examples/site/index.html");
