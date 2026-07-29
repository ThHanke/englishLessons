import type { CalendarFile, CalendarEvent, Holiday } from "../schema/types.ts";
import { addDaysIso } from "../schema/dates.ts";
import type { TeachingSlot } from "./types.ts";
import { deriveHalfYearBoundary, dateHalfYear } from "./halfYear.ts";

export interface RawSlot {
  date: string;
  capacity: number;
  /** The matched `LessonSlot.id` -- only ever set by `enumerateSlots` (the `lesson_slots`-based
   * path), which is also the only path that can emit more than one slot for the same date (e.g.
   * double periods). `enumerateProjectionSlots` never sets this since it's structurally
   * incapable of emitting two slots on the same date. */
  slotId?: string;
}

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function isoWeekday(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return WEEKDAY_ABBR[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

export function isHoliday(dateIso: string, holidays: Holiday[]): boolean {
  return holidays.some((h) => dateIso >= h.from && dateIso <= h.to);
}

export function matchesEvent(dateIso: string, event: CalendarEvent): boolean {
  if (event.date) return event.date === dateIso;
  if (event.from && event.to)
    return dateIso >= event.from && dateIso <= event.to;
  return false;
}

/**
 * Projection-only slot enumeration: distributes `weeklyLessons` slots per school week
 * across available school days (Mon–Fri minus holidays and capacity:0 events). No
 * dependency on `class_schedule` or `lesson_slots` — projection uses `weekly_lessons`
 * from `modules.yaml`.
 */
export function enumerateProjectionSlots(
  calendar: CalendarFile,
  weeklyLessons: number,
): RawSlot[] {
  const slots: RawSlot[] = [];
  let cursor = calendar.first_school_day;
  let currentWeekStart = mondayOf(cursor);
  let weekDays: Array<{ date: string; capacity: number }> = [];

  while (cursor <= calendar.last_school_day) {
    const weekStart = mondayOf(cursor);
    if (weekStart !== currentWeekStart) {
      emitWeekSlots(weekDays, weeklyLessons, slots);
      weekDays = [];
      currentWeekStart = weekStart;
    }

    const dayOfWeek = new Date(cursor + "T00:00:00Z").getUTCDay();
    if (
      dayOfWeek >= 1 &&
      dayOfWeek <= 5 &&
      !isHoliday(cursor, calendar.holidays)
    ) {
      const matchingEvents = calendar.events.filter((e) =>
        matchesEvent(cursor, e),
      );
      const isBlocked = matchingEvents.some((e) => e.capacity === 0);
      if (!isBlocked) {
        const reducing = matchingEvents.find(
          (e) => e.capacity > 0 && e.capacity < 1,
        );
        weekDays.push({
          date: cursor,
          capacity: reducing ? reducing.capacity : 1,
        });
      }
    }
    cursor = addDaysIso(cursor, 1);
  }
  emitWeekSlots(weekDays, weeklyLessons, slots);
  return slots;
}

function mondayOf(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const dow = dt.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function emitWeekSlots(
  weekDays: Array<{ date: string; capacity: number }>,
  weeklyLessons: number,
  out: RawSlot[],
): void {
  for (let i = 0; i < Math.min(weeklyLessons, weekDays.length); i++) {
    out.push({ date: weekDays[i]!.date, capacity: weekDays[i]!.capacity });
  }
}

/**
 * Lesson-slot-based enumeration for the companion calendar appointment view.
 * Walks first..last school day, matches `lesson_slots` by weekday and half-year.
 */
export function enumerateSlots(
  calendar: CalendarFile,
  className: string,
): RawSlot[] {
  const schedule = calendar.class_schedule[className];
  if (!schedule) {
    throw new Error(`No class_schedule entry for "${className}" in calendar`);
  }
  const slots: RawSlot[] = [];

  const lessonSlots = schedule.lesson_slots ?? [];
  if (lessonSlots.length === 0) return slots;

  let boundary: string | null = null;
  try {
    boundary = deriveHalfYearBoundary(calendar);
  } catch {
    console.warn(
      "Could not derive half-year boundary; treating all lesson_slots as active",
    );
  }

  let cursor = calendar.first_school_day;
  while (cursor <= calendar.last_school_day) {
    if (!isHoliday(cursor, calendar.holidays)) {
      const weekday = isoWeekday(cursor);
      const cursorHalfYear = boundary ? dateHalfYear(cursor, boundary) : null;
      const matchingSlots = lessonSlots.filter(
        (slot) =>
          slot.day === weekday &&
          (cursorHalfYear === null || slot.half_year === cursorHalfYear),
      );

      for (const slot of matchingSlots) {
        const matchingEvents = calendar.events.filter((e) =>
          matchesEvent(cursor, e),
        );
        const isBlocked = matchingEvents.some((e) => e.capacity === 0);
        if (!isBlocked) {
          const reducing = matchingEvents.find(
            (e) => e.capacity > 0 && e.capacity < 1,
          );
          slots.push({
            date: cursor,
            capacity: reducing ? reducing.capacity : 1,
            slotId: slot.id,
          });
        }
      }
    }
    cursor = addDaysIso(cursor, 1);
  }

  return slots;
}

/**
 * Step 2's pace weighting: `weight = capacity * pace_factor(slot)`, degrading the last
 * `pre_holiday_days` slots before and the first `post_holiday_days` slots after every
 * holiday (ranked by position in the enumerated slot sequence, not raw calendar days —
 * matching 01-data-model §3.3's "last N school days" definition). Multiplicative when a
 * slot falls in both a post-holiday and a following pre-holiday window.
 */
export function weightSlots(
  slots: RawSlot[],
  calendar: CalendarFile,
): TeachingSlot[] {
  const {
    pre_holiday_days,
    pre_holiday_factor,
    post_holiday_days,
    post_holiday_factor,
  } = calendar.pace_factors;

  const preDegraded = new Set<number>();
  const postDegraded = new Set<number>();

  // Build a map of unique dates (in order) to their slot indices, so that
  // pre/post holiday windows count by calendar day, not by slot index.
  // This matters when multiple slots share a date (e.g. double periods).
  const dateOrder: string[] = [];
  const dateToIndices = new Map<string, number[]>();
  slots.forEach((slot, i) => {
    let indices = dateToIndices.get(slot.date);
    if (!indices) {
      indices = [];
      dateToIndices.set(slot.date, indices);
      dateOrder.push(slot.date);
    }
    indices.push(i);
  });

  for (const holiday of calendar.holidays) {
    const beforeDates: string[] = [];
    const afterDates: string[] = [];
    for (const date of dateOrder) {
      if (date < holiday.from) beforeDates.push(date);
      if (date > holiday.to) afterDates.push(date);
    }
    // `.slice(-0)` is `.slice(0)` in JS (the whole array), not empty -- guard the zero case
    // explicitly so pre_holiday_days: 0 degrades nothing instead of every slot before every holiday.
    const preDates =
      pre_holiday_days > 0 ? beforeDates.slice(-pre_holiday_days) : [];
    for (const date of preDates) {
      for (const i of dateToIndices.get(date)!) preDegraded.add(i);
    }
    for (const date of afterDates.slice(0, post_holiday_days)) {
      for (const i of dateToIndices.get(date)!) postDegraded.add(i);
    }
  }

  return slots.map((slot, i) => {
    let weight = slot.capacity;
    if (preDegraded.has(i)) weight *= pre_holiday_factor;
    if (postDegraded.has(i)) weight *= post_holiday_factor;
    return { ...slot, weight };
  });
}
