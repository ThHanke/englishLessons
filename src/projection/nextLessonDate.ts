import type { CalendarFile } from "../schema/types.ts";
import { enumerateSlots } from "./slots.ts";

/**
 * The class's next scheduled lesson date strictly after `afterDate` -- used as a homework due
 * date. Deliberately not "+1 day" or "same weekday next week": a class typically meets on
 * several different weekdays per week, so the next lesson is often a different weekday, and
 * sometimes several calendar days away. `undefined` when there's no further scheduled slot
 * (e.g. this was the last lesson of the school year) -- callers should omit the due-date line
 * rather than guess.
 */
export function findNextLessonDate(
  calendar: CalendarFile,
  className: string,
  afterDate: string,
): string | undefined {
  const dates = enumerateSlots(calendar, className)
    .map((slot) => slot.date)
    .filter((date) => date > afterDate)
    .sort();
  return dates[0];
}
