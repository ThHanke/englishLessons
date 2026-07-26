import { describe, it, expect } from 'vitest';
import { eventClassFor, moduleColorClass, resolveSelection, toEvent } from './calendarMapping.ts';
import type { CalendarDayResponse } from './api.ts';

function day(overrides: Partial<CalendarDayResponse> & { date: string }): CalendarDayResponse {
  return {
    isTeachingDay: true,
    moduleId: null,
    phase: null,
    weekInModule: null,
    gapSeverity: null,
    gapCount: 0,
    reason: null,
    ...overrides,
  };
}

describe('moduleColorClass', () => {
  it('assigns a stable, distinct class per first-seen module id', () => {
    const order = new Map<string, number>();
    expect(moduleColorClass('m1', order)).toBe('companion-module-0');
    expect(moduleColorClass('m2', order)).toBe('companion-module-1');
    expect(moduleColorClass('m1', order)).toBe('companion-module-0');
  });
});

describe('toEvent', () => {
  it('carries the module id as calendarId for a teaching day', () => {
    const ev = toEvent(day({ date: '2026-08-03', moduleId: 'm1' }));
    expect(ev.calendarId).toBe('m1');
    expect(ev.text).toBe('m1');
  });

  it('has no calendarId for a non-teaching day', () => {
    const ev = toEvent(day({ date: '2026-08-01', isTeachingDay: false, moduleId: null, reason: 'weekend' }));
    expect(ev.calendarId).toBeUndefined();
    expect(ev.text).toBe('weekend');
  });
});

describe('eventClassFor', () => {
  it.each(['uncovered', 'under-depth', 'at-risk'] as const)('gives a distinct class for a %s gap', (kind) => {
    const order = new Map<string, number>();
    const cls = eventClassFor(day({ date: '2026-08-03', moduleId: 'm1', gapSeverity: kind }), order);
    expect(cls).toContain(`companion-gap-${kind}`);
  });

  it('marks a non-teaching day distinctly, without a module or gap class', () => {
    const order = new Map<string, number>();
    const cls = eventClassFor(day({ date: '2026-08-01', isTeachingDay: false, moduleId: null }), order);
    expect(cls).toBe('companion-non-teaching');
  });
});

describe('resolveSelection', () => {
  it('opens chat for a teaching day', () => {
    expect(resolveSelection(day({ date: '2026-08-03', moduleId: 'm1' }))).toEqual({ kind: 'open-chat', date: '2026-08-03' });
  });

  it('surfaces the reason for a non-teaching day instead of opening chat', () => {
    expect(resolveSelection(day({ date: '2026-08-01', isTeachingDay: false, reason: 'weekend' }))).toEqual({
      kind: 'non-teaching-message',
      date: '2026-08-01',
      reason: 'weekend',
    });
  });
});
