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
import { createLessonArtifactServer } from "./artifactTools.ts";

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

  describe("save_material", () => {
    it("saves exercise as HTML", async () => {
      const handler = extractToolHandler(makeServer(), "save_material");

      const result = await handler({
        type: "exercise",
        title: "Gap Fill Passive Voice",
        content: "<h1>Fill the gaps</h1>",
        format: "html",
      });

      expect(result.isError).toBeFalsy();
      const filePath = join(
        tmpDir, "artifacts", CLASS_ID, DATE, "materials",
        "exercise-gap-fill-passive-voice.html",
      );
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe("<h1>Fill the gaps</h1>");
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

      await handler({ type: "exercise", title: "Ex One", content: "a", format: "html" });
      await handler({ type: "homework", title: "HW One", content: "b", format: "md" });

      const materialsDir = join(tmpDir, "artifacts", CLASS_ID, DATE, "materials");
      expect(existsSync(join(materialsDir, "exercise-ex-one.html"))).toBe(true);
      expect(existsSync(join(materialsDir, "homework-hw-one.md"))).toBe(true);
    });
  });
});
