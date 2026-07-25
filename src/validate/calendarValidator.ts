import type { CalendarFile } from '../schema/types.ts';
import type { Issue } from './curriculumValidator.ts';

/** §3.3 shape checks + cross-reference: every class_schedule key must resolve to a real class. */
export function validateCalendar(calendar: CalendarFile, filePath: string, knownClassNames: ReadonlySet<string>): Issue[] {
  const issues: Issue[] = [];

  if (!(calendar.first_school_day < calendar.last_school_day)) {
    issues.push({
      severity: 'error',
      code: 'calendar_invalid_school_year_range',
      message: `first_school_day (${calendar.first_school_day}) must be before last_school_day (${calendar.last_school_day})`,
      file: filePath,
    });
  }

  for (const holiday of calendar.holidays) {
    if (!(holiday.from <= holiday.to)) {
      issues.push({
        severity: 'error',
        code: 'calendar_invalid_holiday_range',
        message: `Holiday "${holiday.name}" has from (${holiday.from}) after to (${holiday.to})`,
        file: filePath,
        id: holiday.name,
      });
    }
  }

  for (const event of calendar.events) {
    if (event.from && event.to && !(event.from <= event.to)) {
      issues.push({
        severity: 'error',
        code: 'calendar_invalid_event_range',
        message: `Event "${event.name}" has from (${event.from}) after to (${event.to})`,
        file: filePath,
        id: event.name,
      });
    }
  }

  for (const className of Object.keys(calendar.class_schedule)) {
    if (!knownClassNames.has(className)) {
      issues.push({
        severity: 'error',
        code: 'calendar_unknown_class',
        message: `class_schedule references unknown class "${className}" (no matching plans/*/class.yaml)`,
        file: filePath,
        id: className,
      });
    }
  }

  return issues;
}
