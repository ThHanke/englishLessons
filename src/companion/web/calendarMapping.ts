import type { CalendarEvent } from '@svar-ui/react-calendar';
import type { CalendarDayResponse } from './api.ts';

/** Deterministic module -> color-slot palette (cycled by first-seen order), so each module reads
 * as a consistent "overlaying calendar" across the month grid — this is a color-slot index, not
 * a per-moduleId CSS rule, so the stylesheet stays static regardless of how many modules exist. */
export const MODULE_PALETTE_SIZE = 8;

export function moduleColorClass(moduleId: string, order: Map<string, number>): string {
  let index = order.get(moduleId);
  if (index === undefined) {
    index = order.size % MODULE_PALETTE_SIZE;
    order.set(moduleId, index);
  }
  return `companion-module-${index}`;
}

/** Gap severity gets a distinct class per kind, ranked uncovered < under-depth < at-risk (matches
 * the server's own ranking in routes/calendar.ts) — layered on top of the module color class. */
export const GAP_CLASS: Record<'uncovered' | 'under-depth' | 'at-risk', string> = {
  uncovered: 'companion-gap-uncovered',
  'under-depth': 'companion-gap-under-depth',
  'at-risk': 'companion-gap-at-risk',
};

export function toEvent(day: CalendarDayResponse): CalendarEvent {
  const start = new Date(`${day.date}T00:00:00`);
  const end = new Date(`${day.date}T23:59:59`);
  return {
    id: day.date,
    start,
    end,
    allDay: true,
    text: day.isTeachingDay ? (day.moduleId ?? '') : (day.reason ?? 'No lesson scheduled'),
    calendarId: day.isTeachingDay ? (day.moduleId ?? undefined) : undefined,
    day,
  };
}

/** Module color is the "overlaying calendar" (each module = one CalendarPanel group, matching
 * SVAR's own calendarId-group pattern) — gap severity layers a second class on top as a border
 * accent, so both are visible on the same chip without needing a separate cell-level pass. */
export function eventClassFor(day: CalendarDayResponse, order: Map<string, number>): string {
  if (!day.isTeachingDay) return 'companion-non-teaching';
  const classes = day.moduleId ? [moduleColorClass(day.moduleId, order)] : [];
  if (day.gapSeverity) classes.push(GAP_CLASS[day.gapSeverity]);
  return classes.join(' ');
}

export type DaySelection = { kind: 'open-chat'; date: string } | { kind: 'non-teaching-message'; date: string; reason: string };

/** Pure decision behind clicking a day's event chip: teaching day -> open chat for that date;
 * non-teaching day -> show its `reason` inline instead (F4) — never both. */
export function resolveSelection(day: CalendarDayResponse): DaySelection {
  if (day.isTeachingDay) return { kind: 'open-chat', date: day.date };
  return { kind: 'non-teaching-message', date: day.date, reason: day.reason ?? 'No lesson scheduled on this date.' };
}
