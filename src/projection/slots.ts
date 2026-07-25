import type { CalendarFile, CalendarEvent, Holiday } from '../schema/types.ts';
import type { TeachingSlot } from './types.ts';

export interface RawSlot {
  date: string;
  capacity: number;
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function isoWeekday(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return WEEKDAY_ABBR[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isHoliday(dateIso: string, holidays: Holiday[]): boolean {
  return holidays.some((h) => dateIso >= h.from && dateIso <= h.to);
}

function matchesEvent(dateIso: string, event: CalendarEvent): boolean {
  if (event.date) return event.date === dateIso;
  if (event.from && event.to) return dateIso >= event.from && dateIso <= event.to;
  return false;
}

/**
 * Steps 1-2 of 02-projection.md: walk first..last school day, keep lesson-day slots
 * outside holiday ranges, drop `capacity: 0` event slots, and reduce fractional-capacity
 * event slots.
 */
export function enumerateSlots(calendar: CalendarFile, className: string): RawSlot[] {
  const schedule = calendar.class_schedule[className];
  if (!schedule) {
    throw new Error(`No class_schedule entry for "${className}" in calendar`);
  }
  const lessonDays = new Set(schedule.lesson_days);
  const slots: RawSlot[] = [];

  let cursor = calendar.first_school_day;
  while (cursor <= calendar.last_school_day) {
    if (lessonDays.has(isoWeekday(cursor)) && !isHoliday(cursor, calendar.holidays)) {
      const matchingEvents = calendar.events.filter((e) => matchesEvent(cursor, e));
      const isBlocked = matchingEvents.some((e) => e.capacity === 0);
      if (!isBlocked) {
        const reducing = matchingEvents.find((e) => e.capacity > 0 && e.capacity < 1);
        slots.push({ date: cursor, capacity: reducing ? reducing.capacity : 1 });
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
export function weightSlots(slots: RawSlot[], calendar: CalendarFile): TeachingSlot[] {
  const { pre_holiday_days, pre_holiday_factor, post_holiday_days, post_holiday_factor } = calendar.pace_factors;

  const preDegraded = new Set<number>();
  const postDegraded = new Set<number>();

  for (const holiday of calendar.holidays) {
    const beforeIdx: number[] = [];
    const afterIdx: number[] = [];
    slots.forEach((slot, i) => {
      if (slot.date < holiday.from) beforeIdx.push(i);
      if (slot.date > holiday.to) afterIdx.push(i);
    });
    for (const i of beforeIdx.slice(-pre_holiday_days)) preDegraded.add(i);
    for (const i of afterIdx.slice(0, post_holiday_days)) postDegraded.add(i);
  }

  return slots.map((slot, i) => {
    let weight = slot.capacity;
    if (preDegraded.has(i)) weight *= pre_holiday_factor;
    if (postDegraded.has(i)) weight *= post_holiday_factor;
    return { ...slot, weight };
  });
}
