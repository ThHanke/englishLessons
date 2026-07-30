import type { CalendarFile } from "../schema/types.ts";
import { enumerateSlots } from "../projection/slots.ts";
import { addDaysIso } from "../schema/dates.ts";
import { SITE_BASE_URL } from "./ghPagesConfig.ts";

const CRLF = "\r\n";

/** Per-date (or per-date+slot, for a double-period class) enrichment for a lesson occurrence's
 * VEVENT -- absent when no `lesson-spec.json` exists yet for that date (most future occurrences,
 * before the teacher has planned that far ahead), in which case the event falls back to the
 * minimal classLabel-only SUMMARY it always had. */
export interface IcsLessonInfo {
  /** `content_field.text` -- this lesson's actual topic, distinct from the module's title. */
  topic: string;
  moduleTitle: string;
  /** `focus_competences[].topic`, human-readable (not raw competence ids) -- becomes both
   * DESCRIPTION text and RFC 5545 CATEGORIES, so a subscriber's calendar app can filter/search by
   * topic across the whole term. */
  competenceTopics: string[];
  hasHomework: boolean;
  hasTest: boolean;
}

/** RFC 5545 §3.3.11 TEXT escaping -- backslash first, so escaping the other characters doesn't
 * double-escape the backslashes it just introduced. */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

/** RFC 5545 §3.1's 75-octet line-folding rule: any content line longer than 75 octets must be
 * split with a CRLF followed by a single leading space, and the receiver un-folds by stripping
 * that CRLF+space. Splits on UTF-8 byte boundaries so a multi-byte character (e.g. an umlaut in
 * a German holiday name) is never cut in half. */
function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let start = 0;
  let limit = 75;
  const decoder = new TextDecoder();
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off while we'd split a multi-byte UTF-8 sequence (continuation bytes are 10xxxxxx).
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    chunks.push(decoder.decode(bytes.slice(start, end)));
    start = end;
    limit = 74; // continuation lines lose one octet to the mandatory leading space
  }
  return chunks.join(`${CRLF} `);
}

/** Shared by `buildSite.ts` (writes `site/calendars/<class>/<slug>.ics`) and
 * `routes/calendars.ts` (serves `/api/calendars/<class>/<slug>.ics`) so the two paths' filenames
 * can't drift apart. */
export function schoolYearSlug(schoolYear: string): string {
  return schoolYear.replace(/\//g, "-");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dateStamp(dateIso: string): string {
  return dateIso.replace(/-/g, "");
}

/** Floating local time (no `Z`, no `TZID`) -- a deliberate v1 scope cut, not an oversight: correct
 * for subscribers in the same timezone as the school (the only real-world case today), but a
 * subscriber's calendar app configured to a different timezone will show shifted times. */
function floatingDateTime(dateIso: string, time: string): string {
  return `${dateStamp(dateIso)}T${time.replace(":", "")}00`;
}

export function generateClassIcs(params: {
  calendar: CalendarFile;
  className: string;
  classLabel: string;
  /** Keyed `${date}::${slotId ?? ""}` -- see `IcsLessonInfo`. Absent/empty is fine (every
   * occurrence just falls back to the minimal SUMMARY-only event). */
  lessonInfoByDateSlot?: Map<string, IcsLessonInfo>;
}): string {
  const { calendar, className, classLabel, lessonInfoByDateSlot } = params;
  const lessonSlots = calendar.class_schedule[className]?.lesson_slots ?? [];
  const lessonSlotById = new Map(lessonSlots.map((s) => [s.id, s]));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//englishLessons//companion//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const occurrence of enumerateSlots(calendar, className)) {
    if (!occurrence.slotId) continue;
    const slot = lessonSlotById.get(occurrence.slotId);
    if (!slot) continue;
    const info = lessonInfoByDateSlot?.get(`${occurrence.date}::${occurrence.slotId}`);
    const pagePath = occurrence.slotId
      ? `${className}/${occurrence.date}/${occurrence.slotId}`
      : `${className}/${occurrence.date}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:lesson-${className}-${occurrence.slotId}-${occurrence.date}@englishlessons.local`,
      `DTSTAMP:${dateStamp(occurrence.date)}T000000Z`,
      `DTSTART:${floatingDateTime(occurrence.date, slot.start)}`,
      `DTEND:${floatingDateTime(occurrence.date, slot.end)}`,
      `SUMMARY:${escapeIcsText(info ? `${classLabel}: ${info.topic}` : classLabel)}`,
    );
    if (info) {
      const descriptionLines = [
        `Module: ${info.moduleTitle}`,
        info.competenceTopics.length > 0 ? `Covers: ${info.competenceTopics.join(", ")}` : null,
        `Lesson plan: ${SITE_BASE_URL}/classes/${pagePath}/lesson-plan/`,
        info.hasHomework ? `Homework: ${SITE_BASE_URL}/classes/${pagePath}/homework/` : null,
        info.hasTest ? `Test: ${SITE_BASE_URL}/classes/${pagePath}/test/` : null,
      ].filter((l): l is string => l !== null);
      lines.push(
        `DESCRIPTION:${escapeIcsText(descriptionLines.join("\n"))}`,
        `URL:${SITE_BASE_URL}/classes/${pagePath}/lesson-plan/`,
      );
      if (info.competenceTopics.length > 0) {
        lines.push(`CATEGORIES:${info.competenceTopics.map(escapeIcsText).join(",")}`);
      }
    }
    lines.push("END:VEVENT");
  }

  for (const holiday of calendar.holidays) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:holiday-${slugify(holiday.name)}-${holiday.from}@englishlessons.local`,
      `DTSTAMP:${dateStamp(holiday.from)}T000000Z`,
      `DTSTART;VALUE=DATE:${dateStamp(holiday.from)}`,
      // All-day DTEND is exclusive (RFC 5545 §3.6.1) -- +1 day on the inclusive `to` so the
      // event visually covers through the holiday's last actual day.
      `DTEND;VALUE=DATE:${dateStamp(addDaysIso(holiday.to, 1))}`,
      `SUMMARY:${escapeIcsText(holiday.name)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
