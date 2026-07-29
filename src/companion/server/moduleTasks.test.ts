import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeYaml } from "../../schema/yaml.ts";
import type { CalendarFile, ClassFile, ModulesFile } from "../../schema/types.ts";
import { moduleTasks } from "./moduleTasks.ts";

const FIXTURE_REPO_ROOT = new URL("./fixtures/repo/", import.meta.url).pathname;

/** A double-period repo: two Monday `lesson_slots` for the same class, both active in the same
 * half-year -- the case `enumerateSlots`/`moduleTasks` previously collapsed into one duplicated
 * appointment (both resolving to the first `.find()` match) instead of two distinct ones. */
function setupDoublePeriodRepo(): { repoRoot: string; cleanup: () => void } {
  const repoRoot = mkdtempSync(join(tmpdir(), "module-tasks-double-period-"));

  const classDir = join(repoRoot, "plans", "double-period-grade");
  mkdirSync(classDir, { recursive: true });
  const classFile: ClassFile = {
    name: "double-period-class",
    grade: 7,
    curriculum: "fixture-curriculum",
  };
  writeYaml(join(classDir, "class.yaml"), classFile);
  const modulesFile: ModulesFile = {
    class: "double-period-class",
    curriculum: "fixture-curriculum",
    total_weeks: 4,
    weekly_lessons: 2,
    buffer_weeks: 0,
    modules: [
      {
        id: "m1",
        title: "Module One",
        weeks: 4,
        content_fields: [],
        goals: [],
        covers: [],
        milestone: { type: "none", assesses: [] },
        pedagogy: { new_grammar: [] },
      },
    ],
  };
  writeYaml(join(classDir, "modules.yaml"), modulesFile);

  mkdirSync(join(repoRoot, "calendar"), { recursive: true });
  const calendar: CalendarFile = {
    state: "fixture-state",
    school_year: "2026/2027",
    first_school_day: "2026-08-03",
    last_school_day: "2026-08-31",
    holidays: [],
    events: [],
    pace_factors: {
      pre_holiday_days: 0,
      pre_holiday_factor: 1,
      post_holiday_days: 0,
      post_holiday_factor: 1,
    },
    half_year_boundary: "2027-02-01",
    class_schedule: {
      "double-period-class": {
        lesson_slots: [
          { id: "morning", day: "Mon", start: "08:00", end: "08:45", half_year: 1 },
          { id: "afternoon", day: "Mon", start: "13:00", end: "13:45", half_year: 1 },
        ],
      },
    },
  };
  writeYaml(join(repoRoot, "calendar", "double-period-calendar.yaml"), calendar);

  return {
    repoRoot,
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true }),
  };
}

describe("moduleTasks", () => {
  it("returns one task per module placement, across every class", () => {
    const { classes, tasks } = moduleTasks({
      from: "2026-08-01",
      to: "2026-09-30",
      repoRoot: FIXTURE_REPO_ROOT,
    });

    expect(classes.map((c) => c.id).sort()).toEqual([
      "fixture-class",
      "fixture-class-no-artifacts",
    ]);
    const byClass = (id: string) => tasks.filter((t) => t.classId === id);
    expect(
      byClass("fixture-class")
        .map((t) => t.moduleId)
        .sort(),
    ).toEqual(["m1", "m2"]);
    expect(
      byClass("fixture-class-no-artifacts").map((t) => t.moduleId),
    ).toEqual(["m1"]);
  });

  it("spans a task from its placement's first to last slot date, with the module title", () => {
    const { tasks } = moduleTasks({
      from: "2026-08-01",
      to: "2026-09-30",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    const m1 = tasks.find(
      (t) => t.classId === "fixture-class" && t.moduleId === "m1",
    )!;

    expect(m1.moduleTitle).toBe("Module One");
    expect(m1.startDate <= m1.endDate).toBe(true);
    expect(m1.startDate).toMatch(/^2026-08/);
  });

  it("lists already-planned lesson-spec dates within a task's range", () => {
    const { tasks } = moduleTasks({
      from: "2026-08-01",
      to: "2026-09-30",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    const m1 = tasks.find(
      (t) => t.classId === "fixture-class" && t.moduleId === "m1",
    )!;

    expect(m1.plannedDates).toContain("2026-08-05");
  });

  it("excludes tasks entirely outside the requested date range", () => {
    const { tasks } = moduleTasks({
      from: "2030-01-01",
      to: "2030-01-31",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    expect(tasks).toEqual([]);
  });

  it("still lists a class with no artifacts, with an empty plannedDates for its task", () => {
    const { tasks } = moduleTasks({
      from: "2026-08-01",
      to: "2026-09-30",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    const noArtifacts = tasks.find(
      (t) => t.classId === "fixture-class-no-artifacts",
    )!;
    expect(noArtifacts.plannedDates).toEqual([]);
  });

  it("returns one appointment per real teaching slot, each already carrying its own class + date", () => {
    const { appointments } = moduleTasks({
      from: "2026-08-03",
      to: "2026-08-05",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    const monday = appointments.find(
      (a) => a.classId === "fixture-class" && a.date === "2026-08-03",
    );

    expect(monday).toBeDefined();
    expect(monday?.moduleId).toBe("m1");
    expect(monday?.moduleTitle).toBe("Module One");
  });

  it("flags an appointment whose date already has a lesson-spec.json", () => {
    const { appointments } = moduleTasks({
      from: "2026-08-05",
      to: "2026-08-05",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    const planned = appointments.find(
      (a) => a.classId === "fixture-class" && a.date === "2026-08-05",
    );
    const unplanned = appointments.find(
      (a) =>
        a.classId === "fixture-class-no-artifacts" && a.date === "2026-08-05",
    );

    expect(planned?.hasLessonSpec).toBe(true);
    expect(unplanned?.hasLessonSpec).toBe(false);
  });

  it("reflects a fixture manifest.json's materials on an appointment, and an empty array when no manifest exists for that date", () => {
    const { appointments } = moduleTasks({
      from: "2026-08-05",
      to: "2026-08-05",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    const planned = appointments.find(
      (a) => a.classId === "fixture-class" && a.date === "2026-08-05",
    );
    const unplanned = appointments.find(
      (a) =>
        a.classId === "fixture-class-no-artifacts" && a.date === "2026-08-05",
    );

    expect(planned?.materials).toEqual([
      { file: "materials/gap_fill-fixture.html", type: "gap_fill", title: "Fixture Gap Fill" },
    ]);
    expect(unplanned?.materials).toEqual([]);
  });

  it("only returns appointments for slots within [from, to], even for a module spanning outside it", () => {
    const { appointments } = moduleTasks({
      from: "2030-01-01",
      to: "2030-01-31",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    expect(appointments).toEqual([]);
  });

  it("returns two distinct appointments for a double-period day, each with its own slotId/start/end", () => {
    const { repoRoot, cleanup } = setupDoublePeriodRepo();
    try {
      const { appointments } = moduleTasks({
        from: "2026-08-03",
        to: "2026-08-03",
        repoRoot,
      });

      expect(appointments).toHaveLength(2);
      const bySlot = new Map(appointments.map((a) => [a.slotId, a]));
      expect(bySlot.get("morning")).toMatchObject({
        date: "2026-08-03",
        start: "08:00",
        end: "08:45",
      });
      expect(bySlot.get("afternoon")).toMatchObject({
        date: "2026-08-03",
        start: "13:00",
        end: "13:45",
      });
    } finally {
      cleanup();
    }
  });
});
