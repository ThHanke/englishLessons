import { describe, it, expect } from "vitest";
import {
  appointmentEventClass,
  appointmentToEvent,
  groupColorClass,
  taskEventClass,
  taskToEvent,
  worstGapSeverity,
} from "./calendarMapping.ts";
import type { Appointment, ModuleTask } from "./api.ts";

function task(
  overrides: Partial<ModuleTask> & { classId: string; moduleId: string },
): ModuleTask {
  return {
    classLabel: overrides.classId,
    moduleTitle: overrides.moduleId,
    startDate: "2026-08-03",
    endDate: "2026-08-14",
    gaps: [],
    plannedDates: [],
    coveragePercent: 0,
    milestoneDate: null,
    milestoneType: "none",
    milestoneAssesses: [],
    estimated: false,
    progressSlotsPlanned: 0,
    progressSlotsTotal: 0,
    ...overrides,
  };
}

function appointment(
  overrides: Partial<Appointment> & {
    classId: string;
    moduleId: string;
    date: string;
  },
): Appointment {
  return {
    classLabel: overrides.classId,
    moduleTitle: overrides.moduleId,
    hasLessonSpec: false,
    materials: [],
    ...overrides,
  };
}

describe("groupColorClass", () => {
  it("assigns a stable, distinct class per first-seen class id", () => {
    const order = new Map<string, number>();
    expect(groupColorClass("grade-5-2026", order)).toBe("companion-module-0");
    expect(groupColorClass("grade-6-2027", order)).toBe("companion-module-1");
    expect(groupColorClass("grade-5-2026", order)).toBe("companion-module-0");
  });
});

describe("worstGapSeverity", () => {
  it("returns null when a task has no gaps", () => {
    expect(
      worstGapSeverity(task({ classId: "c", moduleId: "m1", gaps: [] })),
    ).toBeNull();
  });

  it("ranks at-risk above under-depth above uncovered", () => {
    const gaps = [
      {
        competenceId: "a",
        moduleId: "m1",
        kind: "uncovered" as const,
        requiredDepth: "understand" as const,
        currentDepth: null,
      },
      {
        competenceId: "b",
        moduleId: "m1",
        kind: "at-risk" as const,
        requiredDepth: "produce" as const,
        currentDepth: "practiced" as const,
      },
      {
        competenceId: "c",
        moduleId: "m1",
        kind: "under-depth" as const,
        requiredDepth: "produce" as const,
        currentDepth: "practiced" as const,
      },
    ];
    expect(worstGapSeverity(task({ classId: "c", moduleId: "m1", gaps }))).toBe(
      "at-risk",
    );
  });
});

describe("taskToEvent", () => {
  it("spans the task's full date range and carries the class as calendarId", () => {
    const t = task({
      classId: "grade-7-realschule-2026",
      moduleId: "m1",
      moduleTitle: "Module One",
      startDate: "2026-08-03",
      endDate: "2026-08-14",
    });
    const ev = taskToEvent(t);

    function localIso(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    expect(ev.calendarId).toBe("grade-7-realschule-2026");
    expect(ev.text).toBe("Module One (0%)");
    expect(localIso(ev.start)).toBe("2026-08-03");
    expect(localIso(ev.end)).toBe("2026-08-14");
  });
});

describe("taskEventClass", () => {
  it("combines the class color with a gap-severity accent when the task has gaps", () => {
    const order = new Map<string, number>();
    const gaps = [
      {
        competenceId: "a",
        moduleId: "m1",
        kind: "at-risk" as const,
        requiredDepth: "produce" as const,
        currentDepth: "practiced" as const,
      },
    ];
    const cls = taskEventClass(
      task({ classId: "grade-7-realschule-2026", moduleId: "m1", gaps }),
      order,
    );
    expect(cls).toContain("companion-module-0");
    expect(cls).toContain("companion-gap-at-risk");
  });

  it("is just the class color when a task has no gaps", () => {
    const order = new Map<string, number>();
    const cls = taskEventClass(
      task({ classId: "grade-7-realschule-2026", moduleId: "m1", gaps: [] }),
      order,
    );
    expect(cls).toBe("companion-module-0");
  });
});

describe("appointmentToEvent", () => {
  it("anchors the appointment to a fixed display hour on its date, carrying class as calendarId", () => {
    const a = appointment({
      classId: "grade-7-realschule-2026",
      moduleId: "m1",
      moduleTitle: "Module One",
      date: "2026-08-17",
    });
    const ev = appointmentToEvent(a);

    expect(ev.calendarId).toBe("grade-7-realschule-2026");
    expect(ev.text).toBe("Module One");
    expect(ev.allDay).toBe(false);
    expect(ev.start.getHours()).toBe(8);
    expect(ev.start < ev.end).toBe(true);
  });

  it("gives distinct appointments on the same date the same id shape but different classId/moduleId", () => {
    const a = appointmentToEvent(
      appointment({
        classId: "grade-7-realschule-2026",
        moduleId: "m1",
        date: "2026-08-17",
      }),
    );
    const b = appointmentToEvent(
      appointment({
        classId: "grade-5-2026",
        moduleId: "m2",
        date: "2026-08-17",
      }),
    );
    expect(a.id).not.toBe(b.id);
  });

  it("gives two double-period appointments (same class/module/date, different slot) distinct ids and start times", () => {
    const morning = appointmentToEvent(
      appointment({
        classId: "grade-7-realschule-2026",
        moduleId: "m1",
        date: "2026-08-17",
        slotId: "morning",
        start: "08:15",
        end: "08:45",
      }),
    );
    const afternoon = appointmentToEvent(
      appointment({
        classId: "grade-7-realschule-2026",
        moduleId: "m1",
        date: "2026-08-17",
        slotId: "afternoon",
        start: "13:00",
        end: "13:45",
      }),
    );
    expect(morning.id).not.toBe(afternoon.id);
    expect(morning.start.getHours()).toBe(8);
    expect(afternoon.start.getHours()).toBe(13);
  });
});

describe("appointmentEventClass", () => {
  it("marks a planned appointment distinctly from an unplanned one", () => {
    const order = new Map<string, number>();
    const planned = appointmentEventClass(
      appointment({
        classId: "c",
        moduleId: "m1",
        date: "2026-08-17",
        hasLessonSpec: true,
      }),
      order,
    );
    const unplanned = appointmentEventClass(
      appointment({
        classId: "c",
        moduleId: "m1",
        date: "2026-08-18",
        hasLessonSpec: false,
      }),
      order,
    );

    expect(planned).toContain("companion-planned");
    expect(unplanned).not.toContain("companion-planned");
  });
});
