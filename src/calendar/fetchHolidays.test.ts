import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  mapSchoolHolidays,
  mapPublicHolidays,
  mergeHolidays,
  deriveSchoolYearBounds,
  buildCalendarFile,
  type OpenHolidaysPeriod,
} from "./fetchHolidays.ts";

const fixturePath = new URL(
  "./fixtures/school-holidays-response.json",
  import.meta.url,
).pathname;
const fixture = JSON.parse(
  readFileSync(fixturePath, "utf-8"),
) as OpenHolidaysPeriod[];
const publicFixturePath = new URL(
  "./fixtures/public-holidays-response.json",
  import.meta.url,
).pathname;
const publicFixture = JSON.parse(
  readFileSync(publicFixturePath, "utf-8"),
) as OpenHolidaysPeriod[];

describe("mapSchoolHolidays", () => {
  it("maps the real fixture response to the correct number of holidays[] entries with name/from/to", () => {
    const holidays = mapSchoolHolidays(fixture);
    expect(holidays).toHaveLength(7);
    expect(holidays[0]).toEqual({
      name: "Summer Holidays",
      from: "2026-07-04",
      to: "2026-08-14",
    });
    expect(holidays[2]).toEqual({
      name: "Christmas Holidays",
      from: "2026-12-21",
      to: "2027-01-02",
    });
  });

  it("throws a clear error on an empty response", () => {
    expect(() => mapSchoolHolidays([])).toThrow(/empty or malformed/);
  });

  it("throws a clear error on a malformed period missing dates", () => {
    expect(() =>
      mapSchoolHolidays([
        {
          startDate: "",
          endDate: "",
          type: "School",
          name: [{ language: "EN", text: "X" }],
        },
      ]),
    ).toThrow();
  });

  it("is idempotent across repeated runs against the same fixture", () => {
    expect(mapSchoolHolidays(fixture)).toEqual(mapSchoolHolidays(fixture));
  });
});

describe("deriveSchoolYearBounds", () => {
  it("derives first/last school day from the two Summer-holiday boundary entries", () => {
    const holidays = mapSchoolHolidays(fixture);
    const bounds = deriveSchoolYearBounds(holidays);
    expect(bounds).toEqual({
      first_school_day: "2026-08-15",
      last_school_day: "2027-07-09",
    });
  });

  it("throws when fewer than two Summer Holiday entries are present", () => {
    expect(() =>
      deriveSchoolYearBounds([
        { name: "Autumn Holidays", from: "2026-10-19", to: "2026-10-30" },
      ]),
    ).toThrow();
  });
});

describe("mapPublicHolidays / mergeHolidays", () => {
  it("maps the real public-holidays fixture", () => {
    const publicHolidays = mapPublicHolidays(publicFixture);
    expect(publicHolidays).toHaveLength(11);
    expect(publicHolidays.find((h) => h.name === "Reformation Day")).toEqual({
      name: "Reformation Day",
      from: "2026-10-31",
      to: "2026-10-31",
    });
  });

  it("drops public holidays fully contained within an existing school-holiday range", () => {
    const schoolHolidays = mapSchoolHolidays(fixture);
    const publicHolidays = mapPublicHolidays(publicFixture);
    const merged = mergeHolidays(schoolHolidays, publicHolidays);
    // Christmas Day / 2nd Day of Christmas / New Year's Day fall inside Christmas Holidays;
    // Good Friday / Pentecost Monday fall inside Easter/Pentecost Holidays.
    expect(merged.find((h) => h.name === "Christmas Day")).toBeUndefined();
    expect(merged.find((h) => h.name === "Good Friday")).toBeUndefined();
    expect(merged.find((h) => h.name === "Reformation Day")).toBeDefined();
    expect(merged.find((h) => h.name === "Easter Monday")).toBeDefined();
  });
});

describe("buildCalendarFile", () => {
  it("builds a full CalendarFile from the real fixtures, merging public into school holidays", () => {
    const calendar = buildCalendarFile({
      state: "sachsen-anhalt",
      schoolYear: "2026/2027",
      schoolHolidaysResponse: fixture,
      publicHolidaysResponse: publicFixture,
      className: "grade-7-realschule-2026",
    });
    expect(calendar.first_school_day).toBe("2026-08-15");
    expect(calendar.last_school_day).toBe("2027-07-09");
    expect(calendar.holidays.length).toBeGreaterThan(7);
    expect(calendar.events).toEqual([]);
    expect(calendar.class_schedule["grade-7-realschule-2026"]).toEqual({});
  });
});
