import type { CalendarFile } from '../schema/types.ts';
import { addDaysIso } from '../schema/dates.ts';

export function deriveHalfYearBoundary(calendar: CalendarFile): string {
  if (calendar.half_year_boundary) return calendar.half_year_boundary;
  const winterHoliday = calendar.holidays.find(h => h.name === 'Winter Holidays');
  if (!winterHoliday) {
    throw new Error('Calendar has no half_year_boundary field and no "Winter Holidays" holiday entry — cannot derive the Halbjahr boundary');
  }
  return winterHoliday.from;
}

export function dateHalfYear(dateIso: string, boundary: string): 1 | 2 {
  return dateIso < boundary ? 1 : 2;
}

export function halfYearRange(calendar: CalendarFile, halfYear: 1 | 2): { from: string; to: string } {
  const boundary = deriveHalfYearBoundary(calendar);
  const winterHoliday = calendar.holidays.find(h => h.name === 'Winter Holidays');
  if (halfYear === 1) {
    return { from: calendar.first_school_day, to: addDaysIso(boundary, -1) };
  }
  const h2Start = winterHoliday ? addDaysIso(winterHoliday.to, 1) : boundary;
  return { from: h2Start, to: calendar.last_school_day };
}
