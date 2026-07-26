import { describe, it, expect } from 'vitest';
import { groupColorClass, taskEventClass, taskToEvent, worstGapSeverity } from './calendarMapping.ts';
import type { ModuleTask } from './api.ts';

function task(overrides: Partial<ModuleTask> & { classId: string; moduleId: string }): ModuleTask {
  return {
    classLabel: overrides.classId,
    moduleTitle: overrides.moduleId,
    startDate: '2026-08-03',
    endDate: '2026-08-14',
    gaps: [],
    plannedDates: [],
    ...overrides,
  };
}

describe('groupColorClass', () => {
  it('assigns a stable, distinct class per first-seen class id', () => {
    const order = new Map<string, number>();
    expect(groupColorClass('grade-5-2026', order)).toBe('companion-module-0');
    expect(groupColorClass('grade-6-2027', order)).toBe('companion-module-1');
    expect(groupColorClass('grade-5-2026', order)).toBe('companion-module-0');
  });
});

describe('worstGapSeverity', () => {
  it('returns null when a task has no gaps', () => {
    expect(worstGapSeverity(task({ classId: 'c', moduleId: 'm1', gaps: [] }))).toBeNull();
  });

  it('ranks at-risk above under-depth above uncovered', () => {
    const gaps = [
      { competenceId: 'a', moduleId: 'm1', kind: 'uncovered' as const, requiredDepth: 'understand' as const, currentDepth: null },
      { competenceId: 'b', moduleId: 'm1', kind: 'at-risk' as const, requiredDepth: 'produce' as const, currentDepth: 'practiced' as const },
      { competenceId: 'c', moduleId: 'm1', kind: 'under-depth' as const, requiredDepth: 'produce' as const, currentDepth: 'practiced' as const },
    ];
    expect(worstGapSeverity(task({ classId: 'c', moduleId: 'm1', gaps }))).toBe('at-risk');
  });
});

describe('taskToEvent', () => {
  it('spans the task\'s full date range and carries the class as calendarId', () => {
    const t = task({ classId: 'grade-7-realschule-2026', moduleId: 'm1', moduleTitle: 'Module One', startDate: '2026-08-03', endDate: '2026-08-14' });
    const ev = taskToEvent(t);

    function localIso(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    expect(ev.calendarId).toBe('grade-7-realschule-2026');
    expect(ev.text).toBe('Module One');
    expect(localIso(ev.start)).toBe('2026-08-03');
    expect(localIso(ev.end)).toBe('2026-08-14');
  });
});

describe('taskEventClass', () => {
  it('combines the class color with a gap-severity accent when the task has gaps', () => {
    const order = new Map<string, number>();
    const gaps = [{ competenceId: 'a', moduleId: 'm1', kind: 'at-risk' as const, requiredDepth: 'produce' as const, currentDepth: 'practiced' as const }];
    const cls = taskEventClass(task({ classId: 'grade-7-realschule-2026', moduleId: 'm1', gaps }), order);
    expect(cls).toContain('companion-module-0');
    expect(cls).toContain('companion-gap-at-risk');
  });

  it('is just the class color when a task has no gaps', () => {
    const order = new Map<string, number>();
    const cls = taskEventClass(task({ classId: 'grade-7-realschule-2026', moduleId: 'm1', gaps: [] }), order);
    expect(cls).toBe('companion-module-0');
  });
});
