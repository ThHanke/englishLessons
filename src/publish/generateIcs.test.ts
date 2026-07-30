import { describe, it, expect } from "vitest";
import type { CalendarFile } from "../schema/types.ts";
import { enumerateSlots } from "../projection/slots.ts";
import { generateClassIcs } from "./generateIcs.ts";

function fixtureCalendar(): CalendarFile {
  return {
    state: "fixture-state",
    school_year: "2026/2027",
    first_school_day: "2026-08-03",
    last_school_day: "2026-08-28",
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
      "fixture-class": {
        lesson_slots: [
          { id: "s1", day: "Mon", start: "08:00", end: "08:45", half_year: 1 },
          { id: "s2", day: "Wed", start: "09:00", end: "09:45", half_year: 1 },
        ],
      },
    },
  };
}

describe("generateClassIcs", () => {
  it("emits one VEVENT per lesson occurrence, matching enumerateSlots's count", () => {
    const calendar = fixtureCalendar();
    const ics = generateClassIcs({ calendar, className: "fixture-class", classLabel: "Grade 7" });
    const occurrenceCount = enumerateSlots(calendar, "fixture-class").length;
    const lessonVeventCount = (ics.match(/UID:lesson-/g) ?? []).length;
    expect(lessonVeventCount).toBe(occurrenceCount);
    expect(occurrenceCount).toBeGreaterThan(0);
  });

  it("includes a lesson VEVENT with correctly formatted floating start/end times", () => {
    const calendar = fixtureCalendar();
    const ics = generateClassIcs({ calendar, className: "fixture-class", classLabel: "Grade 7" });
    // 2026-08-03 is a Monday, matches slot s1 (08:00-08:45), not a holiday.
    expect(ics).toContain("UID:lesson-fixture-class-s1-2026-08-03@englishlessons.local");
    expect(ics).toContain("DTSTART:20260803T080000");
    expect(ics).toContain("DTEND:20260803T084500");
    expect(ics).toContain("SUMMARY:Grade 7");
  });

  it("excludes lesson occurrences that fall within a holiday", () => {
    const calendar = fixtureCalendar();
    const ics = generateClassIcs({ calendar, className: "fixture-class", classLabel: "Grade 7" });
    // 2026-08-17 is a Monday inside the Fixture Break holiday -- must not appear.
    expect(ics).not.toContain("UID:lesson-fixture-class-s1-2026-08-17@englishlessons.local");
  });

  it("merges holidays in as all-day VEVENTs with an exclusive DTEND (to + 1 day)", () => {
    const calendar = fixtureCalendar();
    const ics = generateClassIcs({ calendar, className: "fixture-class", classLabel: "Grade 7" });
    expect(ics).toContain("UID:holiday-fixture-break-2026-08-17@englishlessons.local");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260817");
    expect(ics).toContain("DTEND;VALUE=DATE:20260822");
    expect(ics).toContain("SUMMARY:Fixture Break");
  });

  it("produces stable UIDs across repeated calls with identical input, so re-subscribing never duplicates", () => {
    const calendar = fixtureCalendar();
    const first = generateClassIcs({ calendar, className: "fixture-class", classLabel: "Grade 7" });
    const second = generateClassIcs({ calendar, className: "fixture-class", classLabel: "Grade 7" });
    expect(first).toBe(second);
  });

  it("wraps output in a single VCALENDAR with required RFC 5545 header fields", () => {
    const calendar = fixtureCalendar();
    const ics = generateClassIcs({ calendar, className: "fixture-class", classLabel: "Grade 7" });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("CALSCALE:GREGORIAN");
  });

  it("line-folds a long SUMMARY without corrupting a multi-byte character", () => {
    const calendar = fixtureCalendar();
    calendar.holidays = [
      {
        name: "Ein sehr langer Ferienname mit Umlauten wie äöü, der ueber 75 Oktette hinausgeht",
        from: "2026-08-10",
        to: "2026-08-11",
      },
    ];
    const ics = generateClassIcs({ calendar, className: "fixture-class", classLabel: "Grade 7" });
    // Unfold per RFC 5545 (CRLF followed by a single space is removed) and confirm the text
    // round-trips intact, including the umlauts.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("Ein sehr langer Ferienname mit Umlauten wie äöü");
  });

  it("enriches a lesson occurrence with SUMMARY topic, DESCRIPTION links, URL, and CATEGORIES when lessonInfoByDateSlot has an entry", () => {
    const calendar = fixtureCalendar();
    const ics = generateClassIcs({
      calendar,
      className: "fixture-class",
      classLabel: "Grade 7",
      lessonInfoByDateSlot: new Map([
        [
          "2026-08-03::s1",
          {
            topic: "Free time and media",
            moduleTitle: "Me, my family and friends",
            competenceTopics: ["Grammar: Passive", "Listening"],
            hasHomework: true,
            hasTest: false,
          },
        ],
      ]),
    });
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:Grade 7: Free time and media");
    // RFC 5545 TEXT escaping: the literal commas inside these values are backslash-escaped so
    // they aren't mistaken for a list delimiter.
    expect(unfolded).toContain("Module: Me\\, my family and friends");
    expect(unfolded).toContain("Covers: Grammar: Passive\\, Listening");
    expect(unfolded).toContain(
      "URL:https://thhanke.github.io/englishLessons/classes/fixture-class/2026-08-03/s1/lesson-plan/",
    );
    expect(unfolded).toContain(
      "Homework: https://thhanke.github.io/englishLessons/classes/fixture-class/2026-08-03/s1/homework/",
    );
    expect(unfolded).not.toContain("Test:");
    expect(unfolded).toContain("CATEGORIES:Grammar: Passive,Listening");
  });

  it("falls back to the plain classLabel SUMMARY with no URL/CATEGORIES for a date with no lessonInfo entry", () => {
    const calendar = fixtureCalendar();
    const ics = generateClassIcs({
      calendar,
      className: "fixture-class",
      classLabel: "Grade 7",
      lessonInfoByDateSlot: new Map(),
    });
    expect(ics).toContain("SUMMARY:Grade 7\r\n");
    expect(ics).not.toContain("URL:");
    expect(ics).not.toContain("CATEGORIES:");
  });
});
