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

/** `moduleTasks()`'s `listAllClasses` requires both `class.yaml` AND `modules.yaml` to exist for
 * a class to appear in `classes[]` at all -- a minimal DRAFT modules.yaml is enough (the class
 * still gets pushed to `classes[]` before the DRAFT check short-circuits placement computation). */
function writeModules(repoRoot: string, gradeDir: string, className: string): void {
  const dirPath = join(repoRoot, "plans", gradeDir);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(
    join(dirPath, "modules.yaml"),
    stringifyYaml({
      class: className,
      curriculum: "sa-sek-en-2019",
      total_weeks: "DRAFT",
      weekly_lessons: "DRAFT",
      modules: [],
      buffer_weeks: "DRAFT",
    }),
  );
}

function writeCalendar(
  repoRoot: string,
  fileName: string,
  className: string,
  overrides: Record<string, unknown> = {},
): void {
  const calendarDir = join(repoRoot, "calendar");
  mkdirSync(calendarDir, { recursive: true });
  writeFileSync(
    join(calendarDir, fileName),
    stringifyYaml({
      state: "fixture-state",
      school_year: "2026/2027",
      first_school_day: "2026-08-03",
      last_school_day: "2026-09-04",
      holidays: [{ name: "Fixture Break", from: "2026-08-17", to: "2026-08-21" }],
      events: [],
      pace_factors: {
        pre_holiday_days: 0,
        pre_holiday_factor: 1,
        post_holiday_days: 0,
        post_holiday_factor: 1,
      },
      half_year_boundary: "2027-02-01",
      class_schedule: {
        [className]: {
          lesson_slots: [
            { id: "s1", day: "Mon", start: "08:00", end: "08:45", half_year: 1 },
          ],
        },
      },
      ...overrides,
    }),
  );
}

function writeLessonDate(
  repoRoot: string,
  className: string,
  date: string,
  options: { manifest?: unknown; plan?: unknown; materialFiles?: Record<string, string> } = {},
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
  if (options.plan) {
    writeFileSync(join(dateDir, "lesson-plan.json"), JSON.stringify(options.plan, null, 2));
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
            type: "gap_fill",
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

  it("renders lesson-plan.json's objectives/stages when present alongside a lesson-spec", () => {
    writeClass(repoRoot, "grade-7", "grade-7-2026");
    writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21", {
      plan: {
        objectives: ["Identify active vs passive voice"],
        stages: [{ name: "Warm-up", durationMinutes: 9, description: "Retrieval practice" }],
        differentiationNotes: "Band 1 gets a full word bank.",
        exercisePlan: ["gap_fill: 6 sentences, supported"],
      },
    });

    buildSite({ repoRoot, outDir });

    const lessonPage = readFileSync(
      join(outDir, "classes", "grade-7-2026", "2026-08-21", "index.html"),
      "utf-8",
    );
    expect(lessonPage).toContain("Identify active vs passive voice");
    expect(lessonPage).toContain("Warm-up");
    expect(lessonPage).toContain("Band 1 gets a full word bank.");
    expect(lessonPage).not.toContain("No detailed lesson plan saved");
  });

  it('renders "no detailed lesson plan saved" for a lesson-spec with no lesson-plan.json yet', () => {
    writeClass(repoRoot, "grade-7", "grade-7-2026");
    writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21");

    buildSite({ repoRoot, outDir });

    const lessonPage = readFileSync(
      join(outDir, "classes", "grade-7-2026", "2026-08-21", "index.html"),
      "utf-8",
    );
    expect(lessonPage).toContain("No detailed lesson plan saved for this date yet.");
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

  describe("three-way artifact page split", () => {
    function manifestWithTypes(): unknown {
      return {
        materials: [
          {
            file: "01-gap-fill.html",
            type: "gap_fill",
            title: "Gap Fill",
            competenceIds: [],
            depth: "practiced",
            createdAt: "2026-08-21T00:00:00Z",
          },
          {
            file: "02-homework.html",
            type: "homework",
            title: "Homework",
            competenceIds: [],
            depth: "practiced",
            createdAt: "2026-08-21T00:00:00Z",
          },
        ],
      };
    }

    it("writes lesson-plan/index.html excluding homework/test materials", () => {
      writeClass(repoRoot, "grade-7", "grade-7-2026");
      writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21", {
        manifest: manifestWithTypes(),
        materialFiles: {
          "01-gap-fill.html": "<html><body>gap fill body</body></html>",
          "02-homework.html": "<html><body>homework body</body></html>",
        },
      });

      buildSite({ repoRoot, outDir });

      const lessonPlanPage = readFileSync(
        join(outDir, "classes", "grade-7-2026", "2026-08-21", "lesson-plan", "index.html"),
        "utf-8",
      );
      expect(lessonPlanPage).toContain("gap fill body");
      expect(lessonPlanPage).not.toContain("homework body");
    });

    it("writes homework/index.html only when a homework material is present", () => {
      writeClass(repoRoot, "grade-7", "grade-7-2026");
      writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21", {
        manifest: manifestWithTypes(),
        materialFiles: {
          "01-gap-fill.html": "<html><body>gap fill body</body></html>",
          "02-homework.html": "<html><body>homework body</body></html>",
        },
      });

      buildSite({ repoRoot, outDir });

      const homeworkPage = readFileSync(
        join(outDir, "classes", "grade-7-2026", "2026-08-21", "homework", "index.html"),
        "utf-8",
      );
      expect(homeworkPage).toContain("homework body");
      expect(homeworkPage).not.toContain("gap fill body");
    });

    it("omits test/index.html entirely (not just an empty page) when no test material exists", () => {
      writeClass(repoRoot, "grade-7", "grade-7-2026");
      writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21", {
        manifest: manifestWithTypes(),
        materialFiles: {
          "01-gap-fill.html": "<html><body>gap fill body</body></html>",
          "02-homework.html": "<html><body>homework body</body></html>",
        },
      });

      buildSite({ repoRoot, outDir });

      expect(
        existsSync(join(outDir, "classes", "grade-7-2026", "2026-08-21", "test", "index.html")),
      ).toBe(false);
    });

    it("is idempotent for the three-way pages too", () => {
      writeClass(repoRoot, "grade-7", "grade-7-2026");
      writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21", {
        manifest: manifestWithTypes(),
        materialFiles: {
          "01-gap-fill.html": "<html><body>gap fill body</body></html>",
          "02-homework.html": "<html><body>homework body</body></html>",
        },
      });

      buildSite({ repoRoot, outDir });
      const first = readFileSync(
        join(outDir, "classes", "grade-7-2026", "2026-08-21", "lesson-plan", "index.html"),
        "utf-8",
      );
      buildSite({ repoRoot, outDir });
      const second = readFileSync(
        join(outDir, "classes", "grade-7-2026", "2026-08-21", "lesson-plan", "index.html"),
        "utf-8",
      );
      expect(second).toBe(first);
    });
  });

  describe("slot-scoped lesson entries (double periods)", () => {
    it("places output under classes/<class>/<date>/<slotId>/, not treating the slotId as the date", () => {
      writeClass(repoRoot, "grade-7", "grade-7-2026");
      const dateDir = join(repoRoot, "artifacts", "grade-7-2026", "2026-08-21", "slot-abc");
      mkdirSync(dateDir, { recursive: true });
      writeFileSync(
        join(dateDir, "lesson-spec.json"),
        JSON.stringify(lessonSpec({ class: "grade-7-2026", date: "2026-08-21" }), null, 2),
      );

      buildSite({ repoRoot, outDir });

      expect(
        existsSync(
          join(outDir, "classes", "grade-7-2026", "2026-08-21", "slot-abc", "index.html"),
        ),
      ).toBe(true);
      expect(
        existsSync(join(outDir, "classes", "grade-7-2026", "slot-abc", "index.html")),
      ).toBe(false);

      const classIndex = readFileSync(
        join(outDir, "classes", "grade-7-2026", "index.html"),
        "utf-8",
      );
      expect(classIndex).toContain("2026-08-21/slot-abc/");
    });
  });

  describe("static calendar data + ICS export", () => {
    it("writes data/calendar-data.json with classes/tasks/appointments/holidays", () => {
      writeClass(repoRoot, "grade-7", "grade-7-2026");
      writeModules(repoRoot, "grade-7", "grade-7-2026");
      writeCalendar(repoRoot, "fixture-calendar.yaml", "grade-7-2026");
      writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21");

      buildSite({ repoRoot, outDir });

      const dataPath = join(outDir, "data", "calendar-data.json");
      expect(existsSync(dataPath)).toBe(true);
      const data = JSON.parse(readFileSync(dataPath, "utf-8"));
      expect(Array.isArray(data.classes)).toBe(true);
      expect(Array.isArray(data.tasks)).toBe(true);
      expect(Array.isArray(data.appointments)).toBe(true);
      expect(data.holidays).toEqual([
        { name: "Fixture Break", from: "2026-08-17", to: "2026-08-21" },
      ]);
    });

    it("writes a per-class-per-schoolyear .ics with a plausible VEVENT count, plus a calendars listing page", () => {
      writeClass(repoRoot, "grade-7", "grade-7-2026");
      writeModules(repoRoot, "grade-7", "grade-7-2026");
      writeCalendar(repoRoot, "fixture-calendar.yaml", "grade-7-2026");
      writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21");

      buildSite({ repoRoot, outDir });

      const icsPath = join(outDir, "calendars", "grade-7-2026", "2026-2027.ics");
      expect(existsSync(icsPath)).toBe(true);
      const ics = readFileSync(icsPath, "utf-8");
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect((ics.match(/UID:lesson-/g) ?? []).length).toBeGreaterThan(0);
      expect(ics).toContain("UID:holiday-");

      const listingPath = join(outDir, "calendars", "index.html");
      expect(existsSync(listingPath)).toBe(true);
      const listing = readFileSync(listingPath, "utf-8");
      expect(listing).toContain("grade-7-2026/2026-2027.ics");
    });

    it("skips the calendars section entirely when no calendar/*.yaml exists", () => {
      writeClass(repoRoot, "grade-7", "grade-7-2026");
      writeLessonDate(repoRoot, "grade-7-2026", "2026-08-21");

      expect(() => buildSite({ repoRoot, outDir })).not.toThrow();

      expect(existsSync(join(outDir, "data", "calendar-data.json"))).toBe(false);
      expect(existsSync(join(outDir, "calendars"))).toBe(false);
    });
  });
});
