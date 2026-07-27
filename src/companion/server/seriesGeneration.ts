import type { CalendarFile, LessonSlot } from '../../schema/types.ts';
import { halfYearRange } from '../../projection/halfYear.ts';
import { isHoliday, matchesEvent } from '../../projection/slots.ts';
import { addDaysIso } from '../../schema/dates.ts';
import { loadYaml } from '../../schema/yaml.ts';
import { writeYaml } from '../../schema/yaml.ts';

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function isoWeekday(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return WEEKDAY_ABBR[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

export function validateSeriesInput(params: {
  className: string;
  day: string;
  start: string;
  end: string;
  halfYear: number;
}): { valid: true } | { valid: false; error: string } {
  if (!/^[A-Za-z0-9_-]+$/.test(params.className)) {
    return { valid: false, error: 'className must match /^[A-Za-z0-9_-]+$/' };
  }
  const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  if (!validDays.includes(params.day)) {
    return { valid: false, error: `day must be one of ${validDays.join(', ')}` };
  }
  if (!/^\d{2}:\d{2}$/.test(params.start)) {
    return { valid: false, error: 'start must match HH:MM format' };
  }
  if (!/^\d{2}:\d{2}$/.test(params.end)) {
    return { valid: false, error: 'end must match HH:MM format' };
  }
  if (params.halfYear !== 1 && params.halfYear !== 2) {
    return { valid: false, error: 'halfYear must be 1 or 2' };
  }
  return { valid: true };
}

export function validateSlotId(slotId: string): { valid: true } | { valid: false; error: string } {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(slotId)) {
    return { valid: false, error: 'slotId must be a valid UUID' };
  }
  return { valid: true };
}

export function generateSeriesDates(params: {
  calendar: CalendarFile;
  day: string;
  halfYear: 1 | 2;
}): string[] {
  const range = halfYearRange(params.calendar, params.halfYear);
  const dates: string[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    const weekday = isoWeekday(cursor);
    if (
      weekday === params.day
      && !isHoliday(cursor, params.calendar.holidays)
      && !params.calendar.events.filter(e => matchesEvent(cursor, e)).some(e => e.capacity === 0)
    ) {
      dates.push(cursor);
    }
    cursor = addDaysIso(cursor, 1);
  }
  return dates;
}

/** Count all occurrences of a given weekday within a date range (inclusive). */
function countWeekdaysInRange(from: string, to: string, day: string): number {
  let count = 0;
  let cursor = from;
  while (cursor <= to) {
    if (isoWeekday(cursor) === day) count++;
    cursor = addDaysIso(cursor, 1);
  }
  return count;
}

export function seriesPreview(params: {
  calendar: CalendarFile;
  className: string;
  day: string;
  start: string;
  end: string;
  halfYear: 1 | 2;
}): {
  dates: string[];
  skippedCount: number;
  conflicts: Array<{ date: string; classId: string; start: string; end: string }>;
} {
  const dates = generateSeriesDates({
    calendar: params.calendar,
    day: params.day,
    halfYear: params.halfYear,
  });

  const range = halfYearRange(params.calendar, params.halfYear);
  const totalWeekdays = countWeekdaysInRange(range.from, range.to, params.day);
  const skippedCount = totalWeekdays - dates.length;

  // Check conflicts: existing lesson_slots in OTHER classes for the same day+time+halfYear
  const conflicts: Array<{ date: string; classId: string; start: string; end: string }> = [];
  for (const [classId, entry] of Object.entries(params.calendar.class_schedule)) {
    if (classId === params.className) continue;
    if (!entry.lesson_slots) continue;
    for (const slot of entry.lesson_slots) {
      if (
        slot.day === params.day
        && slot.half_year === params.halfYear
        && slot.start === params.start
        && slot.end === params.end
      ) {
        // This class has a conflicting slot — all generated dates are conflicts
        for (const date of dates) {
          conflicts.push({ date, classId, start: slot.start, end: slot.end });
        }
      }
    }
  }

  return { dates, skippedCount, conflicts };
}

// ── Write mutex (KTD7) ──────────────────────────────────────────────────────

let lockPromise = Promise.resolve();

async function withYamlLock<T>(fn: () => T | Promise<T>): Promise<T> {
  let release!: () => void;
  const nextLock = new Promise<void>(r => { release = r; });
  const prev = lockPromise;
  lockPromise = nextLock;
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function persistSeries(params: {
  calendarPath: string;
  className: string;
  slot: LessonSlot;
}): Promise<void> {
  await withYamlLock(() => {
    const calendar = loadYaml<CalendarFile>(params.calendarPath);
    if (!calendar.class_schedule[params.className]) {
      calendar.class_schedule[params.className] = { lesson_days: [] };
    }
    const entry = calendar.class_schedule[params.className]!;
    if (!entry.lesson_slots) {
      entry.lesson_slots = [];
    }
    entry.lesson_slots.push(params.slot);
    writeYaml(params.calendarPath, calendar);
  });
}

export async function deleteSeries(params: {
  calendarPath: string;
  className: string;
  slotId: string;
}): Promise<void> {
  await withYamlLock(() => {
    const calendar = loadYaml<CalendarFile>(params.calendarPath);
    const entry = calendar.class_schedule[params.className];
    if (!entry?.lesson_slots) return;
    entry.lesson_slots = entry.lesson_slots.filter(s => s.id !== params.slotId);
    writeYaml(params.calendarPath, calendar);
  });
}
