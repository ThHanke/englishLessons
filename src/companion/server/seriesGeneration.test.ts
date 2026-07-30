import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CalendarFile } from "../../schema/types.ts";
import { loadYaml, writeYaml } from "../../schema/yaml.ts";
import {
  validateSeriesInput,
  validateSlotId,
  generateSeriesDates,
  seriesPreview,
  persistSeries,
  updateSeriesSlot,
  deleteSeries,
} from "./seriesGeneration.ts";

/** A minimal calendar spanning a known short range for predictable weekday tests. */
function makeCalendar(overrides: Partial<CalendarFile> = {}): CalendarFile {
  return {
    state: "test-state",
    school_year: "2026/2027",
    first_school_day: "2026-08-03", // Monday
    last_school_day: "2026-08-28", // Friday
    holidays: [],
    events: [],
    pace_factors: {
      pre_holiday_days: 0,
      pre_holiday_factor: 1,
      post_holiday_days: 0,
      post_holiday_factor: 1,
    },
    class_schedule: {},
    ...overrides,
  };
}

describe("validateSeriesInput", () => {
  it("accepts valid input", () => {
    const result = validateSeriesInput({
      className: "grade-7",
      day: "Mon",
      start: "08:00",
      end: "09:30",
      halfYear: 1,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects bad className (path traversal)", () => {
    const result = validateSeriesInput({
      className: "../evil",
      day: "Mon",
      start: "08:00",
      end: "09:30",
      halfYear: 1,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects halfYear = 3", () => {
    const result = validateSeriesInput({
      className: "grade-7",
      day: "Mon",
      start: "08:00",
      end: "09:30",
      halfYear: 3,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects day = "Sunday"', () => {
    const result = validateSeriesInput({
      className: "grade-7",
      day: "Sunday",
      start: "08:00",
      end: "09:30",
      halfYear: 1,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects bad time format", () => {
    const result = validateSeriesInput({
      className: "grade-7",
      day: "Mon",
      start: "8:00",
      end: "09:30",
      halfYear: 1,
    });
    expect(result.valid).toBe(false);
  });
});

describe("validateSlotId", () => {
  it("accepts a valid UUID", () => {
    expect(validateSlotId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toEqual({
      valid: true,
    });
  });

  it("accepts a short alphanumeric ID", () => {
    expect(validateSlotId("g7-s1").valid).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(validateSlotId("").valid).toBe(false);
  });
});

describe("generateSeriesDates", () => {
  it("returns correct Mondays in H1 range", () => {
    // Calendar: 2026-08-03 (Mon) to 2026-08-28 (Fri), no half_year_boundary set so we need
    // Winter Holidays for the derivation. For simplicity, set half_year_boundary explicitly.
    const calendar = makeCalendar({ half_year_boundary: "2026-08-17" });
    const dates = generateSeriesDates({ calendar, day: "Mon", halfYear: 1 });
    // H1 range: first_school_day (2026-08-03) to boundary-1 (2026-08-16)
    // Mondays in that range: 2026-08-03, 2026-08-10
    expect(dates).toEqual(["2026-08-03", "2026-08-10"]);
  });

  it("skips holidays", () => {
    const calendar = makeCalendar({
      half_year_boundary: "2026-08-17",
      holidays: [
        { name: "Test Holiday", from: "2026-08-03", to: "2026-08-03" },
      ],
    });
    const dates = generateSeriesDates({ calendar, day: "Mon", halfYear: 1 });
    // Only 2026-08-10 remains (2026-08-03 is a holiday)
    expect(dates).toEqual(["2026-08-10"]);
  });

  it("skips capacity-0 events", () => {
    const calendar = makeCalendar({
      half_year_boundary: "2026-08-17",
      events: [{ name: "Blocked Day", date: "2026-08-03", capacity: 0 }],
    });
    const dates = generateSeriesDates({ calendar, day: "Mon", halfYear: 1 });
    expect(dates).toEqual(["2026-08-10"]);
  });

  it("returns empty when every matching weekday is a holiday", () => {
    const calendar = makeCalendar({
      half_year_boundary: "2026-08-17",
      holidays: [{ name: "Big Holiday", from: "2026-08-01", to: "2026-08-16" }],
    });
    const dates = generateSeriesDates({ calendar, day: "Mon", halfYear: 1 });
    expect(dates).toEqual([]);
  });
});

describe("seriesPreview", () => {
  it("detects conflict when another class has same day+time+halfYear", () => {
    const calendar = makeCalendar({
      half_year_boundary: "2026-08-17",
      class_schedule: {
        "other-class": {
          lesson_slots: [
            {
              id: "existing-id",
              day: "Mon",
              start: "08:00",
              end: "09:30",
              half_year: 1,
            },
          ],
        },
      },
    });
    const result = seriesPreview({
      calendar,
      className: "new-class",
      day: "Mon",
      start: "08:00",
      end: "09:30",
      halfYear: 1,
    });
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]!.classId).toBe("other-class");
  });

  it("computes correct skippedCount", () => {
    const calendar = makeCalendar({
      half_year_boundary: "2026-08-17",
      holidays: [
        { name: "Test Holiday", from: "2026-08-03", to: "2026-08-03" },
      ],
    });
    const result = seriesPreview({
      calendar,
      className: "my-class",
      day: "Mon",
      start: "08:00",
      end: "09:30",
      halfYear: 1,
    });
    // Total Mondays in H1: 2 (08-03, 08-10). One is a holiday.
    expect(result.skippedCount).toBe(1);
    expect(result.dates).toEqual(["2026-08-10"]);
  });
});

describe("persistSeries", () => {
  it("adds slot to existing class entry", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "series-test-"));
    try {
      const calPath = join(tmpDir, "calendar.yaml");
      const calendar = makeCalendar({
        class_schedule: { "my-class": {} },
      });
      writeYaml(calPath, calendar);

      await persistSeries({
        calendarPath: calPath,
        className: "my-class",
        slot: {
          id: "slot-1",
          day: "Mon",
          start: "08:00",
          end: "09:30",
          half_year: 1,
        },
      });

      const raw = readFileSync(calPath, "utf-8");
      expect(raw).toContain("slot-1");
      expect(raw).toContain("08:00");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates new class_schedule entry when absent", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "series-test-"));
    try {
      const calPath = join(tmpDir, "calendar.yaml");
      const calendar = makeCalendar({ class_schedule: {} });
      writeYaml(calPath, calendar);

      await persistSeries({
        calendarPath: calPath,
        className: "new-class",
        slot: {
          id: "slot-2",
          day: "Tue",
          start: "10:00",
          end: "11:30",
          half_year: 2,
        },
      });

      const raw = readFileSync(calPath, "utf-8");
      expect(raw).toContain("new-class");
      expect(raw).toContain("slot-2");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("updateSeriesSlot", () => {
  it("replaces day/start/end/half_year in place, keeping the same id -- so already-planned lessons stay associated by slotId", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "series-test-"));
    try {
      const calPath = join(tmpDir, "calendar.yaml");
      const calendar = makeCalendar({
        class_schedule: {
          "my-class": {
            lesson_slots: [
              { id: "keep-my-id", day: "Mon", start: "08:00", end: "08:45", half_year: 1 },
              { id: "other-slot", day: "Wed", start: "10:00", end: "10:45", half_year: 1 },
            ],
          },
        },
      });
      writeYaml(calPath, calendar);

      const result = await updateSeriesSlot({
        calendarPath: calPath,
        className: "my-class",
        slotId: "keep-my-id",
        day: "Thu",
        start: "09:00",
        end: "09:45",
        halfYear: 2,
      });

      expect(result.updated).toBe(true);
      const updated = loadYaml<CalendarFile>(calPath);
      const slots = updated.class_schedule["my-class"]!.lesson_slots!;
      expect(slots).toHaveLength(2);
      const editedSlot = slots.find((s) => s.id === "keep-my-id");
      expect(editedSlot).toEqual({
        id: "keep-my-id",
        day: "Thu",
        start: "09:00",
        end: "09:45",
        half_year: 2,
      });
      // The other slot in the same class is untouched.
      expect(slots.find((s) => s.id === "other-slot")).toEqual({
        id: "other-slot",
        day: "Wed",
        start: "10:00",
        end: "10:45",
        half_year: 1,
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns updated: false and makes no change when the slotId doesn't exist for that class", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "series-test-"));
    try {
      const calPath = join(tmpDir, "calendar.yaml");
      const calendar = makeCalendar({
        class_schedule: {
          "my-class": {
            lesson_slots: [{ id: "real-slot", day: "Mon", start: "08:00", end: "08:45", half_year: 1 }],
          },
        },
      });
      writeYaml(calPath, calendar);

      const result = await updateSeriesSlot({
        calendarPath: calPath,
        className: "my-class",
        slotId: "does-not-exist",
        day: "Tue",
        start: "09:00",
        end: "09:45",
        halfYear: 1,
      });

      expect(result.updated).toBe(false);
      const unchanged = loadYaml<CalendarFile>(calPath);
      expect(unchanged.class_schedule["my-class"]!.lesson_slots).toEqual([
        { id: "real-slot", day: "Mon", start: "08:00", end: "08:45", half_year: 1 },
      ]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("deleteSeries", () => {
  it("removes slot by id, leaves others", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "series-test-"));
    try {
      const calPath = join(tmpDir, "calendar.yaml");
      const calendar = makeCalendar({
        class_schedule: {
          "my-class": {
            lesson_slots: [
              {
                id: "keep-me",
                day: "Mon",
                start: "08:00",
                end: "09:30",
                half_year: 1,
              },
              {
                id: "delete-me",
                day: "Wed",
                start: "10:00",
                end: "11:30",
                half_year: 1,
              },
            ],
          },
        },
      });
      writeYaml(calPath, calendar);

      await deleteSeries({
        calendarPath: calPath,
        className: "my-class",
        slotId: "delete-me",
      });

      const raw = readFileSync(calPath, "utf-8");
      expect(raw).toContain("keep-me");
      expect(raw).not.toContain("delete-me");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("with non-existent slotId is a no-op", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "series-test-"));
    try {
      const calPath = join(tmpDir, "calendar.yaml");
      const calendar = makeCalendar({
        class_schedule: {
          "my-class": {
            lesson_slots: [
              {
                id: "existing",
                day: "Mon",
                start: "08:00",
                end: "09:30",
                half_year: 1,
              },
            ],
          },
        },
      });
      writeYaml(calPath, calendar);

      await deleteSeries({
        calendarPath: calPath,
        className: "my-class",
        slotId: "nonexistent",
      });

      const raw = readFileSync(calPath, "utf-8");
      expect(raw).toContain("existing");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("write mutex serialization", () => {
  it("rapid writes serialize correctly", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "series-test-"));
    try {
      const calPath = join(tmpDir, "calendar.yaml");
      const calendar = makeCalendar({ class_schedule: { "my-class": {} } });
      writeYaml(calPath, calendar);

      // Fire 5 concurrent persists
      const promises = Array.from({ length: 5 }, (_, i) =>
        persistSeries({
          calendarPath: calPath,
          className: "my-class",
          slot: {
            id: `slot-${i}`,
            day: "Mon",
            start: "08:00",
            end: "09:30",
            half_year: 1,
          },
        }),
      );
      await Promise.all(promises);

      const raw = readFileSync(calPath, "utf-8");
      for (let i = 0; i < 5; i++) {
        expect(raw).toContain(`slot-${i}`);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
