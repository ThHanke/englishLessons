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
import { stringifyYaml } from "../schema/yaml.ts";
import { buildSite } from "./buildSite.ts";

function lessonSpec(overrides: Record<string, unknown> = {}) {
  return {
    class: "grade-7-2026",
    date: "2026-08-21",
    school_week: 2,
    module: { id: "m1", title: "Passive Voice Intro", week_in_module: 1, of: 4 },
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

function writeClass(repoRoot: string, gradeDir: string, className: string): void {
  const dirPath = join(repoRoot, "plans", gradeDir);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(
    join(dirPath, "class.yaml"),
    stringifyYaml({ name: className, grade: 7, curriculum: "sa-sek-en-2019" }),
  );
}

function writeLessonDate(
  repoRoot: string,
  className: string,
  date: string,
  options: { manifest?: unknown; materialFiles?: Record<string, string> } = {},
): void {
  const dateDir = join(repoRoot, "artifacts", className, date);
  mkdirSync(dateDir, { recursive: true });
  writeFileSync(
    join(dateDir, "lesson-spec.json"),
    JSON.stringify(lessonSpec({ class: className, date }), null, 2),
  );
  if (options.manifest) {
    writeFileSync(join(dateDir, "manifest.json"), JSON.stringify(options.manifest, null, 2));
  }
  if (options.materialFiles) {
    const materialsDir = join(dateDir, "materials");
    mkdirSync(materialsDir, { recursive: true });
    for (const [file, content] of Object.entries(options.materialFiles)) {
      writeFileSync(join(materialsDir, file), content);
    }
  }
}

describe("buildSite", () => {
  let repoRoot: string;
  let outDir: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "build-site-repo-"));
    outDir = join(mkdtempSync(join(tmpdir(), "build-site-out-")), "site");
    return () => {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    };
  });

  it("produces a root index, two class pages, two lesson pages, with materials copied alongside each lesson page", () => {
    writeClass(repoRoot, "grade-7", "grade-7-2026");
    writeClass(repoRoot, "grade-6", "grade-6-2026");
    writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21", {
      manifest: {
        materials: [
          {
            file: "01-gap-fill-passive-voice.html",
            type: "exercise",
            title: "Passive Voice Gap Fill",
            competenceIds: ["fk.g.passive"],
            depth: "introduced",
            createdAt: "2026-08-21T00:00:00Z",
          },
        ],
      },
      materialFiles: { "01-gap-fill-passive-voice.html": "<html><body>gap fill</body></html>" },
    });
    writeLessonDate(repoRoot, "grade-6-2026", "2026-09-01", {
      materialFiles: { "01-vocab-quiz.html": "<html><body>quiz</body></html>" },
    });

    buildSite({ repoRoot, outDir });

    expect(existsSync(join(outDir, "index.html"))).toBe(true);
    expect(existsSync(join(outDir, "classes", "grade-7-2026", "index.html"))).toBe(true);
    expect(existsSync(join(outDir, "classes", "grade-6-2026", "index.html"))).toBe(true);
    expect(
      existsSync(join(outDir, "classes", "grade-7-2026", "2026-08-21", "index.html")),
    ).toBe(true);
    expect(
      existsSync(join(outDir, "classes", "grade-6-2026", "2026-09-01", "index.html")),
    ).toBe(true);
    expect(
      existsSync(
        join(
          outDir,
          "classes",
          "grade-7-2026",
          "2026-08-21",
          "materials",
          "01-gap-fill-passive-voice.html",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(outDir, "classes", "grade-6-2026", "2026-09-01", "materials", "01-vocab-quiz.html"),
      ),
    ).toBe(true);

    const rootIndex = readFileSync(join(outDir, "index.html"), "utf-8");
    expect(rootIndex).toContain("classes/grade-7-2026/");
    expect(rootIndex).toContain("classes/grade-6-2026/");

    const lessonPage = readFileSync(
      join(outDir, "classes", "grade-7-2026", "2026-08-21", "index.html"),
      "utf-8",
    );
    expect(lessonPage).toContain("Passive Voice Gap Fill");
  });

  it('renders "no materials yet" for a lesson-spec with no corresponding manifest.json (and no material files) yet', () => {
    writeClass(repoRoot, "grade-7", "grade-7-2026");
    writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21");

    expect(() => buildSite({ repoRoot, outDir })).not.toThrow();

    const lessonPage = readFileSync(
      join(outDir, "classes", "grade-7-2026", "2026-08-21", "index.html"),
      "utf-8",
    );
    expect(lessonPage).toContain("No materials yet");
  });

  it("produces a valid empty-but-non-crashing site/ (root index with zero classes) when artifacts/ is absent entirely", () => {
    writeClass(repoRoot, "grade-7", "grade-7-2026");
    // No artifacts/ directory created at all.

    expect(() => buildSite({ repoRoot, outDir })).not.toThrow();

    expect(existsSync(join(outDir, "index.html"))).toBe(true);
    const rootIndex = readFileSync(join(outDir, "index.html"), "utf-8");
    expect(rootIndex).not.toContain("classes/grade-7-2026/");
    expect(existsSync(join(outDir, "classes"))).toBe(false);
  });

  it("is idempotent: running twice against the same outDir does not append or duplicate output", () => {
    writeClass(repoRoot, "grade-7", "grade-7-2026");
    writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21", {
      materialFiles: { "01-gap-fill.html": "<html><body>one</body></html>" },
    });

    buildSite({ repoRoot, outDir });
    const firstRun = readFileSync(join(outDir, "classes", "grade-7-2026", "index.html"), "utf-8");

    buildSite({ repoRoot, outDir });
    const secondRun = readFileSync(join(outDir, "classes", "grade-7-2026", "index.html"), "utf-8");

    expect(secondRun).toBe(firstRun);
    expect((secondRun.match(/2026-08-21/g) ?? []).length).toBe(
      (firstRun.match(/2026-08-21/g) ?? []).length,
    );
  });
});
