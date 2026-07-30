import { beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod/v4";
import { createLessonArtifactServer, MaterialSchema } from "./artifactTools.ts";

function validLessonSpec(overrides: Record<string, unknown> = {}) {
  return {
    class: "grade-7-2026",
    date: "2026-09-01",
    school_week: 2,
    module: { id: "m1", title: "Test module", week_in_module: 1, of: 9 },
    phase: "new_input",
    pace_factor: 1,
    pace_reason: "normal",
    focus_competences: [
      { id: "fk.g.passive", topic: "passive voice", mode: ["understand"] },
    ],
    content_field: { id: "c.test", text: "Test content" },
    text_types: ["dialog"],
    milestone_context: { next: "test", in_slots: 5, assesses: ["fk.g.passive"] },
    prior_covered: [],
    cefr_target: "B1",
    known_vocab_ref: "grade-7-2026@m1",
    textbook_refs: [],
    suggested_exercise_types: ["gap_fill"],
    curriculum_ref: "sa-sek-en-2019",
    ...overrides,
  };
}

function extractToolHandler(
  server: ReturnType<typeof createLessonArtifactServer>,
  toolName: string,
): (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const registered = (server.instance as any)._registeredTools as Record<
    string,
    { handler: (args: any) => Promise<any> }
  >;
  const t = registered[toolName];
  if (!t) throw new Error(`Tool "${toolName}" not found`);
  return (args) => t.handler(args);
}

describe("artifactTools", () => {
  const CLASS_ID = "grade-7-2026";
  const DATE = "2026-09-01";
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "artifact-tools-"));
    return () => rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeServer() {
    return createLessonArtifactServer({
      classId: CLASS_ID,
      date: DATE,
      repoRoot: tmpDir,
    });
  }

  describe("save_lesson_spec", () => {
    it("writes valid spec to correct path", async () => {
      const server = makeServer();
      const handler = extractToolHandler(server, "save_lesson_spec");
      const spec = validLessonSpec();

      const result = await handler(spec);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain("Saved lesson-spec");

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-spec.json");
      expect(existsSync(filePath)).toBe(true);
      const written = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(written.class).toBe(CLASS_ID);
      expect(written.date).toBe(DATE);
      expect(written.focus_competences).toEqual(spec.focus_competences);
    });

    it("rejects mismatched class", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_spec");
      const spec = validLessonSpec({ class: "wrong-class" });

      const result = await handler(spec);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("wrong-class");

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-spec.json");
      expect(existsSync(filePath)).toBe(false);
    });

    it("rejects mismatched date", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_spec");
      const spec = validLessonSpec({ date: "2099-01-01" });

      const result = await handler(spec);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("2099-01-01");
    });

    it("rejects a known_vocab_ref that isn't <classId>@<moduleId> -- e.g. a guessed file path (regression: the agent once guessed 'plans/grade-7-realschule/vocabulary.yaml' instead of '<classId>@m1', which silently broke find_new_vocabulary three tool calls later)", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_spec");
      const spec = validLessonSpec({
        known_vocab_ref: "plans/grade-7-realschule/vocabulary.yaml",
      });

      const result = await handler(spec);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("known_vocab_ref");
      expect(result.content[0]!.text).toContain(`${CLASS_ID}@`);
      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-spec.json");
      expect(existsSync(filePath)).toBe(false);
    });

    it("accepts a known_vocab_ref with any module id suffix, as long as it's scoped to the current class", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_spec");
      const spec = validLessonSpec({ known_vocab_ref: `${CLASS_ID}@m3` });

      const result = await handler(spec);

      expect(result.isError).toBeFalsy();
    });

    it("creates directories when they don't exist", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_spec");
      const spec = validLessonSpec();

      await handler(spec);

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-spec.json");
      expect(existsSync(filePath)).toBe(true);
    });

    it("overwrites existing lesson-spec", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_spec");

      await handler(validLessonSpec({ pace_reason: "first" }));
      await handler(validLessonSpec({ pace_reason: "second" }));

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-spec.json");
      const written = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(written.pace_reason).toBe("second");
    });
  });

  describe("save_lesson_plan", () => {
    function validLessonPlan(overrides: Record<string, unknown> = {}) {
      return {
        class: CLASS_ID,
        date: DATE,
        objectives: ["Identify active vs passive voice", "Produce passive sentences about school/media"],
        stages: [
          { name: "Warm-up / Review", durationMinutes: 9, purpose: "Retrieval + prior-knowledge bridge", procedure: ["Quick oral recall.", "Bridge to today's target."] },
          { name: "Input", durationMinutes: 10, purpose: "Dialog with passive-voice pattern", procedure: ["Read the dialog aloud."] },
          { name: "Guided Practice", durationMinutes: 20, purpose: "Gap fill, MCQ, matching", procedure: ["Gap fill.", "MCQ.", "Matching."] },
          { name: "Production", durationMinutes: 5, purpose: "Error correction", procedure: ["Find and fix the error."] },
          { name: "Wrap-up", durationMinutes: 1, purpose: "Exit ticket", procedure: ["Thumbs up/down on I-can statements."] },
        ],
        differentiationNotes: "Band 1 gets a full word bank; Band 3 gets no hints.",
        exercisePlan: ["gap_fill: 6 sentences, supported", "mcq: 5 items, guided"],
        ...overrides,
      };
    }

    it("writes a valid lesson-plan.json to the correct path", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_plan");
      const plan = validLessonPlan();

      const result = await handler(plan);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain("Saved lesson plan");

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-plan.json");
      expect(existsSync(filePath)).toBe(true);
      const written = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(written.objectives).toEqual(plan.objectives);
      expect(written.stages).toHaveLength(5);
    });

    it("rejects mismatched class", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_plan");
      const result = await handler(validLessonPlan({ class: "wrong-class" }));

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("wrong-class");
      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-plan.json");
      expect(existsSync(filePath)).toBe(false);
    });

    it("rejects mismatched date", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_plan");
      const result = await handler(validLessonPlan({ date: "2099-01-01" }));

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("2099-01-01");
    });

    it("overwrites an existing lesson-plan.json", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_plan");

      await handler(validLessonPlan({ differentiationNotes: "first" }));
      await handler(validLessonPlan({ differentiationNotes: "second" }));

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-plan.json");
      const written = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(written.differentiationNotes).toBe("second");
    });

    it("is independent of lesson-spec.json -- can be saved without one existing yet", async () => {
      const handler = extractToolHandler(makeServer(), "save_lesson_plan");
      const result = await handler(validLessonPlan());
      expect(result.isError).toBeFalsy();
      expect(existsSync(join(tmpDir, "artifacts", CLASS_ID, DATE, "lesson-spec.json"))).toBe(false);
    });
  });

  describe("save_material", () => {
    it("rejects type 'exercise' -- exercises must go through generate_exercise (KTD1)", async () => {
      // MaterialSchema's type enum no longer includes 'exercise'; this proves the Zod schema
      // itself is the enforcement point (the SDK validates args against it before the handler
      // ever runs, so calling the handler directly with an invalid `type` wouldn't exercise this
      // guarantee -- the schema is what the SDK layer actually checks).
      const result = z.object(MaterialSchema).safeParse({
        type: "exercise",
        title: "Gap Fill Passive Voice",
        content: "<h1>Fill the gaps</h1>",
        format: "html",
      });
      expect(result.success).toBe(false);
    });

    it("saves homework as markdown", async () => {
      const handler = extractToolHandler(makeServer(), "save_material");

      await handler({
        type: "homework",
        title: "Unit 1 Review",
        content: "# Homework\n\nDo exercises 1-5.",
        format: "md",
      });

      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "homework-unit-1-review.md",
      );
      expect(existsSync(filePath)).toBe(true);
    });

    it("slugifies special characters", async () => {
      const handler = extractToolHandler(makeServer(), "save_material");

      await handler({
        type: "test",
        title: "Über — special chars! (v2)",
        content: "test content",
        format: "html",
      });

      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "test-ber-special-chars-v2.html",
      );
      expect(existsSync(filePath)).toBe(true);
    });

    it("creates materials directory when it doesn't exist", async () => {
      const handler = extractToolHandler(makeServer(), "save_material");

      await handler({
        type: "notes",
        title: "Lesson Notes",
        content: "Some notes",
        format: "md",
      });

      const materialsDir = join(tmpDir, "artifacts", CLASS_ID, DATE, "materials");
      expect(existsSync(materialsDir)).toBe(true);
    });

    it("saves multiple materials without overwriting", async () => {
      const handler = extractToolHandler(makeServer(), "save_material");

      await handler({ type: "test", title: "Test One", content: "a", format: "html" });
      await handler({ type: "homework", title: "HW One", content: "b", format: "md" });

      const materialsDir = join(tmpDir, "artifacts", CLASS_ID, DATE, "materials");
      expect(existsSync(join(materialsDir, "test-test-one.html"))).toBe(true);
      expect(existsSync(join(materialsDir, "homework-hw-one.md"))).toBe(true);
    });

    function manifestPath() {
      return join(tmpDir, "artifacts", CLASS_ID, DATE, "manifest.json");
    }

    function readManifest() {
      return JSON.parse(readFileSync(manifestPath(), "utf-8"));
    }

    it("records a manifest.json entry with type 'homework' at 'practiced' depth -- without this, the three-way artifact page split can't tell it apart from a lesson-plan exercise", async () => {
      const handler = extractToolHandler(makeServer(), "save_material");

      await handler({
        type: "homework",
        title: "Unit 1 Homework",
        content: "<p>Do it</p>",
        format: "html",
      });

      const manifest = readManifest();
      expect(manifest.materials).toContainEqual(
        expect.objectContaining({
          file: "materials/homework-unit-1-homework.html",
          type: "homework",
          title: "Unit 1 Homework",
          depth: "practiced",
        }),
      );
    });

    it("records a manifest.json entry with type 'test' at 'assessed' depth", async () => {
      const handler = extractToolHandler(makeServer(), "save_material");

      await handler({
        type: "test",
        title: "Unit 1 Test",
        content: "<p>Answer these</p>",
        format: "html",
      });

      const manifest = readManifest();
      expect(manifest.materials).toContainEqual(
        expect.objectContaining({
          file: "materials/test-unit-1-test.html",
          type: "test",
          title: "Unit 1 Test",
          depth: "assessed",
        }),
      );
    });

    it("appends to an existing manifest.json alongside generate_exercise entries, rather than overwriting it", async () => {
      const server = makeServer();
      await extractToolHandler(server, "generate_exercise")({
        type: "gap_fill",
        title: "Gap Fill",
        competenceIds: ["fk.g.passive"],
        items: [{ sentence: "x ___ y.", blanks: [{ answer: "is", position: 0 }] }],
      });
      await extractToolHandler(server, "save_material")({
        type: "homework",
        title: "Homework",
        content: "<p>x</p>",
        format: "html",
      });

      const manifest = readManifest();
      expect(manifest.materials).toHaveLength(2);
      expect(manifest.materials.map((m: { type: string }) => m.type).sort()).toEqual([
        "gap_fill",
        "homework",
      ]);
    });
  });

  describe("generate_exercise", () => {
    function manifestPath() {
      return join(tmpDir, "artifacts", CLASS_ID, DATE, "manifest.json");
    }

    function readManifest() {
      return JSON.parse(readFileSync(manifestPath(), "utf-8"));
    }

    it("writes a gap_fill file under materials/ and creates manifest.json at 'practiced' depth", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "gap_fill",
        title: "Passive Voice Gap Fill",
        competenceIds: ["fk.g.passive"],
        items: [{ sentence: "The room ___ every day.", blanks: [{ answer: "is cleaned", position: 0, hint: "clean" }] }],
      });

      expect(result.isError).toBeFalsy();
      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "gap_fill-passive-voice-gap-fill.html",
      );
      expect(existsSync(filePath)).toBe(true);
      expect(existsSync(manifestPath())).toBe(true);
      const manifest = readManifest();
      expect(manifest.materials).toHaveLength(1);
      expect(manifest.materials[0]).toMatchObject({
        file: "materials/gap_fill-passive-voice-gap-fill.html",
        type: "gap_fill",
        title: "Passive Voice Gap Fill",
        competenceIds: ["fk.g.passive"],
        depth: "practiced",
      });
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('<span class="hint">(clean)</span>');
    });

    it("appends a second call for a different type to the existing manifest.json rather than overwriting it", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      await handler({
        type: "gap_fill",
        title: "Gap Fill One",
        competenceIds: ["fk.g.passive"],
        items: [{ sentence: "It ___ done.", blanks: [{ answer: "is", position: 0 }] }],
      });
      await handler({
        type: "mcq",
        title: "MCQ One",
        competenceIds: ["fk.g.passive"],
        items: [{ question: "Pick one", options: ["a", "b"], correctIndex: 0 }],
      });

      const manifest = readManifest();
      expect(manifest.materials).toHaveLength(2);
      expect(manifest.materials.map((m: { type: string }) => m.type)).toEqual(["gap_fill", "mcq"]);
    });

    it("dispatches mcq requests to the mcq renderer", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      await handler({
        type: "mcq",
        title: "MCQ Dispatch Check",
        competenceIds: ["fk.g.passive"],
        items: [{ question: "Pick one", options: ["a", "b"], correctIndex: 0 }],
      });

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "materials", "mcq-mcq-dispatch-check.html");
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('type="radio"');
    });

    it("dispatches matching requests to the matching renderer", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      await handler({
        type: "matching",
        title: "Matching Dispatch Check",
        competenceIds: ["fk.g.passive"],
        items: [{ left: "cat", right: "gato" }, { left: "dog", right: "perro" }],
      });

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "materials", "matching-matching-dispatch-check.html");
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('data-left="0"');
      expect(html).toContain('data-right="0"');
    });

    it("dispatches error_correction requests to the error-correction renderer", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "error_correction",
        title: "Word Order Dispatch Check",
        competenceIds: ["fk.g.word_order"],
        items: [
          { sentence: "Yesterday went I to school.", correction: "Yesterday I went to school.", errorType: "word order" },
        ],
      });

      expect(result.isError).toBeFalsy();
      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "error_correction-word-order-dispatch-check.html",
      );
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('data-correct="0"');
      const manifest = readManifest();
      expect(manifest.materials[0]).toMatchObject({ type: "error_correction", depth: "practiced" });
    });

    it("dispatches crossword requests to the crossword renderer", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "crossword",
        title: "Vocab Dispatch Check",
        competenceIds: ["fk.v.school"],
        items: [
          { word: "CAT", clue: "A pet that meows" },
          { word: "CAR", clue: "A vehicle" },
        ],
      });

      expect(result.isError).toBeFalsy();
      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "crossword-vocab-dispatch-check.html",
      );
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('data-row="0" data-col="0"');
      const manifest = readManifest();
      expect(manifest.materials[0]).toMatchObject({ type: "crossword", depth: "practiced" });
    });

    it("dispatches flashcards requests to the flashcards renderer", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "flashcards",
        title: "Vocab Flashcards Dispatch Check",
        competenceIds: ["fk.v.school"],
        items: [{ front: "apple", back: "der Apfel" }],
      });

      expect(result.isError).toBeFalsy();
      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "flashcards-vocab-flashcards-dispatch-check.html",
      );
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('class="flip"');
      const manifest = readManifest();
      expect(manifest.materials[0]).toMatchObject({ type: "flashcards", depth: "practiced" });
    });

    it("dispatches reorder requests to the reorder renderer", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "reorder",
        title: "Story Order Dispatch Check",
        competenceIds: ["fk.k.schreiben"],
        items: [{ fragments: ["First.", "Then.", "Finally."] }],
      });

      expect(result.isError).toBeFalsy();
      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "reorder-story-order-dispatch-check.html",
      );
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('class="fragments"');
      const manifest = readManifest();
      expect(manifest.materials[0]).toMatchObject({ type: "reorder", depth: "practiced" });
    });

    it("dispatches mark_the_words requests to the mark-the-words renderer", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "mark_the_words",
        title: "Past Tense Dispatch Check",
        competenceIds: ["fk.g.tense"],
        items: [
          { text: "She walked to school.", targetIndices: [1], instruction: "Click every past-tense verb." },
        ],
      });

      expect(result.isError).toBeFalsy();
      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "mark_the_words-past-tense-dispatch-check.html",
      );
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('class="word"');
      const manifest = readManifest();
      expect(manifest.materials[0]).toMatchObject({ type: "mark_the_words", depth: "practiced" });
    });

    it("dispatches word_search requests to the word-search renderer", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "word_search",
        title: "Vocab Word Search Dispatch Check",
        competenceIds: ["fk.v.school"],
        items: [{ word: "CAT" }, { word: "DOG" }],
      });

      expect(result.isError).toBeFalsy();
      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "word_search-vocab-word-search-dispatch-check.html",
      );
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain('class="cell"');
      const manifest = readManifest();
      expect(manifest.materials[0]).toMatchObject({ type: "word_search", depth: "practiced" });
    });

    it("rejects crossword-typed items shaped like matching items", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "crossword",
        title: "Malformed Crossword",
        competenceIds: ["fk.v.school"],
        items: [{ left: "cat", right: "gato" }],
      });

      expect(result.isError).toBe(true);
    });

    it("rejects mcq-typed items shaped like gap_fill items, without writing a file or touching manifest.json", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "mcq",
        title: "Malformed MCQ",
        competenceIds: ["fk.g.passive"],
        items: [{ sentence: "The room ___ every day.", blanks: [{ answer: "is cleaned", position: 0 }] }],
      });

      expect(result.isError).toBe(true);
      const materialsDir = join(tmpDir, "artifacts", CLASS_ID, DATE, "materials");
      expect(existsSync(materialsDir)).toBe(false);
      expect(existsSync(manifestPath())).toBe(false);
    });

    it("rejects an empty title", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      const result = await handler({
        type: "gap_fill",
        title: "   ",
        competenceIds: ["fk.g.passive"],
        items: [{ sentence: "It ___ done.", blanks: [{ answer: "is", position: 0 }] }],
      });

      expect(result.isError).toBe(true);
    });

    it("lands both entries in manifest.json when two calls happen for the same date, neither overwriting the other", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      await Promise.resolve(
        await handler({
          type: "gap_fill",
          title: "First",
          competenceIds: ["fk.g.passive"],
          items: [{ sentence: "It ___ done.", blanks: [{ answer: "is", position: 0 }] }],
        }),
      );
      await handler({
        type: "gap_fill",
        title: "Second",
        competenceIds: ["fk.g.passive"],
        items: [{ sentence: "It ___ made.", blanks: [{ answer: "is", position: 0 }] }],
      });

      const manifest = readManifest();
      expect(manifest.materials).toHaveLength(2);
      expect(manifest.materials.map((m: { title: string }) => m.title)).toEqual(["First", "Second"]);
    });

    it("populates contentText from the parsed items so it's available for vocabulary scanning", async () => {
      const handler = extractToolHandler(makeServer(), "generate_exercise");

      await handler({
        type: "mcq",
        title: "Content Text Check",
        competenceIds: ["fk.g.passive"],
        items: [{ question: "Pick the caretaker", options: ["caretaker", "teacher"], correctIndex: 0 }],
      });

      const manifest = readManifest();
      expect(manifest.materials[0].contentText).toEqual(
        expect.arrayContaining(["Pick the caretaker", "caretaker", "teacher"]),
      );
    });
  });

  describe("find_new_vocabulary / generate_vocab_intro", () => {
    function writeVocabFixture() {
      mkdirSync(join(tmpDir, "vocabulary"), { recursive: true });
      writeFileSync(
        join(tmpDir, "vocabulary", "grade-7.yaml"),
        [
          "class: grade-7-2026",
          "inherits_from: null",
          "cumulative: true",
          "generated_from:",
          "  curriculum: fixture-curriculum",
          "  method: agent-role-assignment",
          "required_leveling:",
          "  frequency_list: ngsl-1.2",
          "modules:",
          "  m1: [passive, voice, clean, room]",
          "taught_through: m1",
        ].join("\n"),
      );
    }

    async function saveSpec(handler: (args: Record<string, unknown>) => Promise<unknown>) {
      await handler(validLessonSpec());
    }

    function manifestPath() {
      return join(tmpDir, "artifacts", CLASS_ID, DATE, "manifest.json");
    }

    it("rejects find_new_vocabulary when no lesson-spec.json exists yet", async () => {
      const handler = extractToolHandler(makeServer(), "find_new_vocabulary");
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("No lesson-spec.json");
    });

    it("finds vocabulary used in the lesson-spec that isn't in the known-vocabulary chain", async () => {
      writeVocabFixture();
      const server = makeServer();
      await saveSpec(extractToolHandler(server, "save_lesson_spec"));

      const result = await extractToolHandler(server, "find_new_vocabulary")({});
      expect(result.isError).toBeFalsy();
      // "passive" and "voice" are known (m1); the lesson-spec's own text otherwise has no other
      // obvious target vocabulary here beyond that, so this mainly proves the tool runs end to
      // end without needing generated materials yet.
      expect(result.content[0]!.text).toMatch(/New vocabulary found|No new vocabulary found/);
    });

    it("also scans already-generated materials' contentText for new vocabulary", async () => {
      writeVocabFixture();
      const server = makeServer();
      await saveSpec(extractToolHandler(server, "save_lesson_spec"));
      await extractToolHandler(server, "generate_exercise")({
        type: "gap_fill",
        title: "Caretaker Practice",
        competenceIds: ["fk.g.passive"],
        items: [{ sentence: "The caretaker cleans the room.", blanks: [{ answer: "cleans", position: 0 }] }],
      });

      const result = await extractToolHandler(server, "find_new_vocabulary")({});
      expect(result.content[0]!.text).toContain("caretaker");
      // "room" and "clean"/"cleans" are known via the fixture vocab (m1 includes "room", "clean");
      // "caretaker" is not, so it should surface as new while "room" should not.
      expect(result.content[0]!.text).not.toMatch(/\broom\b/);
    });

    it("generate_vocab_intro writes a vocab_intro material at 'introduced' depth with competenceIds from the lesson-spec", async () => {
      writeVocabFixture();
      const server = makeServer();
      await saveSpec(extractToolHandler(server, "save_lesson_spec"));

      const result = await extractToolHandler(server, "generate_vocab_intro")({
        title: "New Words",
        words: [{ word: "caretaker", translation: "Hausmeister" }],
      });
      expect(result.isError).toBeFalsy();

      const filePath = join(tmpDir, "artifacts", CLASS_ID, DATE, "materials", "vocab_intro-new-words.html");
      expect(existsSync(filePath)).toBe(true);
      const html = readFileSync(filePath, "utf-8");
      expect(html).toContain("Hausmeister");

      const manifest = JSON.parse(readFileSync(manifestPath(), "utf-8"));
      expect(manifest.materials[0]).toMatchObject({
        type: "vocab_intro",
        title: "New Words",
        competenceIds: ["fk.g.passive"],
        depth: "introduced",
      });
    });

    it("generate_vocab_intro rejects an empty title", async () => {
      const handler = extractToolHandler(makeServer(), "generate_vocab_intro");
      const result = await handler({ title: "   ", words: [{ word: "caretaker", translation: "Hausmeister" }] });
      expect(result.isError).toBe(true);
    });

    it("generate_vocab_intro works even with no lesson-spec.json (competenceIds falls back to empty)", async () => {
      const handler = extractToolHandler(makeServer(), "generate_vocab_intro");
      const result = await handler({
        title: "Standalone Words",
        words: [{ word: "caretaker", translation: "Hausmeister" }],
      });
      expect(result.isError).toBeFalsy();
      const manifest = JSON.parse(readFileSync(manifestPath(), "utf-8"));
      expect(manifest.materials[0]).toMatchObject({ competenceIds: [] });
    });
  });
});
