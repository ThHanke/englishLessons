import { describe, it, expect } from 'vitest';
import { loadYaml } from '../schema/yaml.ts';
import type { CalendarFile } from '../schema/types.ts';
import { validateCalendar } from './calendarValidator.ts';

const fixturePath = new URL('./fixtures/calendar-valid.yaml', import.meta.url).pathname;
function loadFixture(): CalendarFile {
  return loadYaml<CalendarFile>(fixturePath);
}

describe('validateCalendar: valid fixture', () => {
  it('passes with zero errors', () => {
    const calendar = loadFixture();
    const issues = validateCalendar(calendar, 'calendar-valid.yaml', new Set(['test-class']));
    expect(issues).toEqual([]);
  });
});

describe('validateCalendar: schema errors', () => {
  it('flags a holiday range with from after to, naming the range and file', () => {
    const calendar = loadFixture();
    calendar.holidays[0]!.from = '2026-11-01';
    calendar.holidays[0]!.to = '2026-10-30';
    const issues = validateCalendar(calendar, 'calendar-valid.yaml', new Set(['test-class']));
    const issue = issues.find((i) => i.code === 'calendar_invalid_holiday_range');
    expect(issue).toBeDefined();
    expect(issue!.file).toBe('calendar-valid.yaml');
    expect(issue!.id).toBe('Autumn Holidays');
  });

  it('flags an event range with from after to, naming the event and file', () => {
    const calendar = loadFixture();
    calendar.events[0]!.from = '2026-05-29';
    calendar.events[0]!.to = '2026-05-28';
    const issues = validateCalendar(calendar, 'calendar-valid.yaml', new Set(['test-class']));
    const issue = issues.find((i) => i.code === 'calendar_invalid_event_range');
    expect(issue).toBeDefined();
    expect(issue!.file).toBe('calendar-valid.yaml');
    expect(issue!.id).toBe('Sportfest');
  });

  it('flags a class_schedule key with no matching class.yaml', () => {
    const calendar = loadFixture();
    const issues = validateCalendar(calendar, 'calendar-valid.yaml', new Set(['some-other-class']));
    expect(issues.some((i) => i.code === 'calendar_unknown_class' && i.id === 'test-class')).toBe(true);
  });

  it('flags first_school_day not before last_school_day', () => {
    const calendar = loadFixture();
    calendar.first_school_day = '2027-07-09';
    calendar.last_school_day = '2026-08-15';
    const issues = validateCalendar(calendar, 'calendar-valid.yaml', new Set(['test-class']));
    expect(issues.some((i) => i.code === 'calendar_invalid_school_year_range')).toBe(true);
  });
});

describe('validateCalendar: real committed calendar', () => {
  it('passes with zero errors against the real class registry', () => {
    const realCalendarPath = new URL('../../calendar/sachsen-anhalt-2026-2027.yaml', import.meta.url).pathname;
    const realCalendar = loadYaml<CalendarFile>(realCalendarPath);
    const issues = validateCalendar(realCalendar, 'calendar/sachsen-anhalt-2026-2027.yaml', new Set(['grade-7-realschule-2026']));
    expect(issues).toEqual([]);
  });
});
