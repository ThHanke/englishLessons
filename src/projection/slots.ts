import type { CalendarFile, CalendarEvent, Holiday } from "../schema/types.ts";
import { addDaysIso } from "../schema/dates.ts";
import type { TeachingSlot } from "./types.ts";
import { deriveHalfYearBoundary, dateHalfYear } from "./halfYear.ts";

export interface RawSlot {
  date: string;
  capacity: number;
  /** The matched `LessonSlot.id` -- set whenever `enumerateSlots` matches a `lesson_slots`
   * entry, which is also how it can emit more than one slot for the same date (e.g. double
   * periods). */
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
 * Lesson-slot-based enumeration -- the single source of truth for "which dates does this
 * class actually teach," used both for the companion calendar's appointments and (since
 * this replaced the old `weekly_lessons`-guessing `enumerateProjectionSlots`) for
 * curriculum pacing/module placement. Walks first..last school day, matches `lesson_slots`
 * by weekday and half-year. Returns `[]` for a class with no `lesson_slots` defined yet --
 * not an error, just nothing to place (same tier as still-DRAFT `weekly_lessons`).
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
 * Coarse week-count estimate for a class with no `lesson_slots` defined yet -- distributes
 * `weeklyLessons` slots per school week across the first available school days (Mon-Fri
 * minus holidays and capacity:0 events), same holiday-degradation as any other slot set via
 * `weightSlots`. Deliberately does NOT guess which weekday(s) the class actually meets --
 * that was the old `enumerateProjectionSlots` bug (a guessed Mon/Tue/Wed-style pattern that
 * silently disagreed with the class's real schedule once one existed, misclassifying real
 * teaching days as non-teaching).
 *
 * Feeds `moduleTasks.ts`'s early module-bar preview ONLY -- never `dateContext.ts` (which
 * needs an exact per-date answer for "is this a teaching day," not an estimate) and never
 * appointment generation (there's no UI path to plan a lesson before `lesson_slots` exists
 * at all, so there's nothing concrete to schedule yet). Once a class gets a real schedule,
 * `moduleTasks.ts` switches to `enumerateSlots` and this estimate stops being used for it --
 * automatically, since projection is recomputed fresh on every request, never cached.
 */
export function estimateWeeklySlots(
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
