import { describe, it, expect } from "vitest";
import { loadYaml } from "../schema/yaml.ts";
import type { CalendarFile, ModulesFile } from "../schema/types.ts";
import { enumerateProjectionSlots, weightSlots } from "./slots.ts";
import { fillModules } from "./fillModules.ts";
import { whichModule, weekTable } from "./query.ts";

const realCalendarPath = new URL(
  "../../calendar/sachsen-anhalt-2026-2027.yaml",
  import.meta.url,
).pathname;
const realModulesPath = new URL(
  "../../plans/grade-7-realschule/modules.yaml",
  import.meta.url,
).pathname;
const realCalendar = loadYaml<CalendarFile>(realCalendarPath);
const realModules = loadYaml<ModulesFile>(realModulesPath);
const className = "grade-7-realschule-2026";
const realSlots = weightSlots(
  enumerateProjectionSlots(realCalendar, realModules.weekly_lessons as number),
  realCalendar,
);
const realPlacements = fillModules(realSlots, realModules);

describe("whichModule", () => {
  it("returns the correct module + week_in_module + phase for a date inside a module range", () => {
    const firstDate = realPlacements[0]!.slots[0]!.date;
    const result = whichModule(realPlacements, firstDate);
    expect(result.moduleId).toBe("m1");
    expect(result.weekInModule).toBe(1);
    expect(result.phase).not.toBeNull();
  });

  it('returns a clear "no lesson" result for a date inside a holiday, not a crash or stale module', () => {
    const holidayDate = "2026-12-24"; // inside Christmas Holidays
    const result = whichModule(realPlacements, holidayDate);
    expect(result.moduleId).toBeNull();
    expect(result.weekInModule).toBeNull();
    expect(result.phase).toBeNull();
    expect(result.reason).toMatch(/no lesson/);
  });

  it("run against today's real date returns a plausible non-error result", () => {
    const result = whichModule(realPlacements, "2026-07-25");
    expect(result).toBeDefined();
    expect(result.reason).toBeTruthy();
  });
});

describe("weekTable", () => {
  it("row count matches the real slot count; every row has a module, phase, and weight", () => {
    const rows = weekTable(realPlacements);
    expect(rows.length).toBe(realSlots.length);
    for (const row of rows) {
      expect(row.moduleId).toBeTruthy();
      expect(row.phase).toBeTruthy();
      expect(typeof row.weight).toBe("number");
    }
  });
});
