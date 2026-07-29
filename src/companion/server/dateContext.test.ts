import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeYaml } from "../../schema/yaml.ts";
import type { CalendarFile, ClassFile, ModulesFile } from "../../schema/types.ts";
import { dateContext, type TeachingDayContext } from "./dateContext.ts";

const FIXTURE_REPO_ROOT = new URL("./fixtures/repo/", import.meta.url).pathname;

/** Same double-period shape as `moduleTasks.test.ts`'s fixture: two Monday `lesson_slots` for
 * one class, both active in the same half-year. */
function setupDoublePeriodRepo(): { repoRoot: string; cleanup: () => void } {
  const repoRoot = mkdtempSync(join(tmpdir(), "date-context-double-period-"));

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

/** Same past-school-year trick as `moduleTasks.test.ts`'s `setupDriftRepo`: a 2020 school year so
 * "today" is irrelevant, one lesson-spec at the very first slot, so drift is deterministic. */
function setupDriftRepo(): { repoRoot: string; cleanup: () => void } {
  const repoRoot = mkdtempSync(join(tmpdir(), "date-context-drift-"));

  const classDir = join(repoRoot, "plans", "drift-grade");
  mkdirSync(classDir, { recursive: true });
  const classFile: ClassFile = {
    name: "drift-class",
    grade: 7,
    curriculum: "fixture-curriculum",
  };
  writeYaml(join(classDir, "class.yaml"), classFile);
  const modulesFile: ModulesFile = {
    class: "drift-class",
    curriculum: "fixture-curriculum",
    total_weeks: 4,
    weekly_lessons: 1,
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
    school_year: "2019/2020",
    first_school_day: "2020-01-06",
    last_school_day: "2020-02-02",
    holidays: [],
    events: [],
    pace_factors: {
      pre_holiday_days: 0,
      pre_holiday_factor: 1,
      post_holiday_days: 0,
      post_holiday_factor: 1,
    },
    half_year_boundary: "2020-02-01",
    class_schedule: { "drift-class": {} },
  };
  writeYaml(join(repoRoot, "calendar", "drift-calendar.yaml"), calendar);

  const firstSlotDir = join(repoRoot, "artifacts", "drift-class", "2020-01-06");
  mkdirSync(firstSlotDir, { recursive: true });
  writeFileSync(
    join(firstSlotDir, "manifest.json"),
    JSON.stringify({ class: "drift-class", date: "2020-01-06", materials: [] }),
  );

  return {
    repoRoot,
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true }),
  };
}

describe("dateContext", () => {
  it("returns moduleId, weekInModule, phase, and that module's gap-report entries for a date with an active module", () => {
    const ctx = dateContext({
      className: "fixture-class",
      date: "2026-08-03",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.moduleId).toBe("m1");
    expect(teaching.weekInModule).toBe(1);
    expect(teaching.phase).toBe("new_input");
    // c.uncovered is never touched by any scanned lesson-spec -> always uncovered.
    expect(
      teaching.gaps.find((g) => g.competenceId === "c.uncovered")?.kind,
    ).toBe("uncovered");
    // c.underdepth was touched by the 2026-08-05 lesson-spec fixture (depth capped at
    // 'introduced'), which never meets a produce requirement -> under-depth or at-risk, never
    // absent. At 2026-08-03 the m1 milestone (2026-08-14) is 5 slots away, outside the default
    // 4-slot at-risk window, so it classifies as under-depth here.
    expect(
      teaching.gaps.find((g) => g.competenceId === "c.underdepth")?.kind,
    ).toBe("under-depth");
    // gaps are scoped to the active module (m1) only.
    expect(teaching.gaps.every((g) => g.moduleId === "m1")).toBe(true);
  });

  it("includes the at-risk gap classification, not just uncovered/under-depth, for a date near a milestone", () => {
    // 2026-08-10 is 2 teaching slots before m1's 2026-08-14 milestone - inside the default
    // 4-slot at-risk window.
    const ctx = dateContext({
      className: "fixture-class",
      date: "2026-08-10",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.moduleId).toBe("m1");
    expect(
      teaching.gaps.find((g) => g.competenceId === "c.underdepth")?.kind,
    ).toBe("at-risk");
  });

  it("includes a reference to an existing lesson-spec.json for the date", () => {
    const ctx = dateContext({
      className: "fixture-class",
      date: "2026-08-05",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.lessonSpecPath).toBe(
      "artifacts/fixture-class/2026-08-05/fix-s2/lesson-spec.json",
    );
    expect(teaching.slotId).toBe("fix-s2");
    expect(teaching.lessonSpec).not.toBeNull();
    expect(teaching.lessonSpec!.date).toBe("2026-08-05");
  });

  it("returns context with no artifact reference for a date with no lesson-spec yet", () => {
    // 2026-08-04 is a Tuesday — the 2nd of 3 projection slots in this week (Mon/Tue/Wed).
    const ctx = dateContext({
      className: "fixture-class",
      date: "2026-08-04",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.lessonSpecPath).toBeNull();
    expect(teaching.lessonSpec).toBeNull();
  });

  it("flags a holiday/weekend/non-teaching date distinctly (isTeachingDay: false) so the caller can skip opening a chat session", () => {
    // 2026-08-08 is a Saturday - not a teaching day.
    const ctx = dateContext({
      className: "fixture-class",
      date: "2026-08-08",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    expect(ctx.isTeachingDay).toBe(false);
    if (ctx.isTeachingDay) throw new Error("unreachable");
    expect(ctx.reason).toMatch(/holiday, weekend, or outside the school year/);
    // Discriminated union: no moduleId/gaps field leaks onto the non-teaching branch.
    expect(
      (ctx as unknown as Record<string, unknown>).moduleId,
    ).toBeUndefined();
  });

  it("builds an empty-but-valid ledger (no throw) for a class with no lesson-spec.json artifacts on disk", () => {
    const ctx = dateContext({
      className: "fixture-class-no-artifacts",
      date: "2026-08-03",
      repoRoot: FIXTURE_REPO_ROOT,
    });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.moduleId).toBe("m1");
    // With an empty ledger, every target competence is uncovered.
    expect(
      teaching.gaps.find((g) => g.competenceId === "c.uncovered")?.kind,
    ).toBe("uncovered");
    expect(teaching.lessonSpecPath).toBeNull();
  });

  it("throws a clear error for a double-period date when no slotId is given", () => {
    const { repoRoot, cleanup } = setupDoublePeriodRepo();
    try {
      expect(() =>
        dateContext({
          className: "double-period-class",
          date: "2026-08-03",
          repoRoot,
        }),
      ).toThrowError(/Multiple lesson slots match.*morning.*afternoon.*slotId/);
    } finally {
      cleanup();
    }
  });

  it("resolves the given slot and scopes the lesson-spec lookup to it, for a double-period date", () => {
    const { repoRoot, cleanup } = setupDoublePeriodRepo();
    try {
      const ctx = dateContext({
        className: "double-period-class",
        date: "2026-08-03",
        slotId: "afternoon",
        repoRoot,
      });
      expect(ctx.isTeachingDay).toBe(true);
      const teaching = ctx as TeachingDayContext;
      expect(teaching.slotId).toBe("afternoon");
      expect(teaching.lessonSpecPath).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("includes calendarDrift, computed as of the requested date against the last-taught date", () => {
    const { repoRoot, cleanup } = setupDriftRepo();
    try {
      const ctx = dateContext({
        className: "drift-class",
        date: "2020-01-27",
        repoRoot,
      });
      expect(ctx.isTeachingDay).toBe(true);
      const teaching = ctx as TeachingDayContext;
      expect(teaching.calendarDrift).toEqual({
        asOfDate: "2020-01-27",
        plannedSlotIndex: 4,
        actualSlotIndex: 1,
        behindBySlots: 3,
      });
    } finally {
      cleanup();
    }
  });
});
