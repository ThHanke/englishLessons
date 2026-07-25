import { describe, it, expect } from 'vitest';
import type { TeachingSlot } from './types.ts';
import type { ModulesFile } from '../schema/types.ts';
import { computeBudgets, fillModules } from './fillModules.ts';

function modulesFile(overrides: Partial<ModulesFile> = {}): ModulesFile {
  return {
    class: 'test-class',
    curriculum: 'test-curriculum',
    total_weeks: 4,
    weekly_lessons: 2,
    buffer_weeks: 0,
    modules: [
      {
        id: 'm1',
        title: 'Module One',
        weeks: 1,
        content_fields: [],
        goals: [],
        covers: [],
        milestone: { type: 'test', assesses: [] },
        pedagogy: { new_grammar: [] },
      },
      {
        id: 'm2',
        title: 'Module Two',
        weeks: 1,
        content_fields: [],
        goals: [],
        covers: [],
        milestone: { type: 'test', assesses: [] },
        pedagogy: { new_grammar: [] },
      },
    ],
    ...overrides,
  };
}

describe('milestone forward-only placement (KTD6)', () => {
  it('shifts a milestone landing on a degraded slot forward to the next healthy slot, never earlier', () => {
    // m1's budget (2) is crossed exactly by a pre-holiday degraded slot (weight 0.6 < capacity 1),
    // so that slot is the naive last-of-module candidate; the next slot is healthy.
    const slots: TeachingSlot[] = [
      { date: '2026-09-01', capacity: 1, weight: 1 },
      { date: '2026-09-03', capacity: 1, weight: 0.5 },
      { date: '2026-09-05', capacity: 1, weight: 0.6 }, // degraded, crosses budget=2 here
      { date: '2026-09-08', capacity: 1, weight: 1 }, // healthy, next slot overall
      { date: '2026-09-10', capacity: 1, weight: 1 },
    ];
    const placements = fillModules(slots, modulesFile());
    const m1 = placements.find((p) => p.moduleId === 'm1')!;

    expect(m1.milestoneShift).not.toBeNull();
    expect(m1.milestoneShift!.originalDate).toBe('2026-09-05');
    expect(m1.milestoneShift!.placedDate).toBe('2026-09-08');
    // Never shift earlier than the original candidate date.
    expect(m1.milestoneShift!.placedDate >= m1.milestoneShift!.originalDate).toBe(true);
    expect(m1.milestoneDate).toBe('2026-09-08');
  });

  it('compresses/delays the next module rather than preponing the test when the shift eats into its slots', () => {
    const slots: TeachingSlot[] = [
      { date: '2026-09-01', capacity: 1, weight: 1 },
      { date: '2026-09-03', capacity: 1, weight: 0.5 },
      { date: '2026-09-05', capacity: 1, weight: 0.6 }, // degraded, crosses m1's budget
      { date: '2026-09-08', capacity: 1, weight: 1 }, // healthy - absorbed into m1's milestone shift
      { date: '2026-09-10', capacity: 1, weight: 1 }, // m2 now starts here instead of 09-08
      { date: '2026-09-12', capacity: 1, weight: 1 },
    ];
    const placements = fillModules(slots, modulesFile());
    const m2 = placements.find((p) => p.moduleId === 'm2')!;

    // Without the shift, m2 would have started at 2026-09-08 (budget=2 crossed right after m1's
    // naive last slot). The shift consumed that slot for m1's milestone, so m2's start moved later.
    expect(m2.slots[0]!.date).toBe('2026-09-10');
  });

  it('leaves the milestone on the degraded candidate, unshifted, when no healthy slot exists before the school year ends', () => {
    // Every slot from the crossing point onward is degraded, all the way to the end of the array.
    const slots: TeachingSlot[] = [
      { date: '2026-09-01', capacity: 1, weight: 1 },
      { date: '2026-09-03', capacity: 1, weight: 0.5 },
      { date: '2026-09-05', capacity: 1, weight: 0.6 }, // degraded, crosses m1's budget=2
      { date: '2026-09-08', capacity: 1, weight: 0.5 }, // degraded
      { date: '2026-09-10', capacity: 1, weight: 0.5 }, // degraded - last slot in the calendar
    ];
    const placements = fillModules(slots, modulesFile());
    const m1 = placements.find((p) => p.moduleId === 'm1')!;

    expect(m1.milestoneShift).toBeNull();
    expect(m1.milestoneDate).toBe('2026-09-05');
    expect(() => fillModules(slots, modulesFile())).not.toThrow();
  });
});

describe('fillModules', () => {
  it('fills all budgets and produces contiguous, non-overlapping date ranges per module in order', () => {
    const slots: TeachingSlot[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      capacity: 1,
      weight: 1,
    }));
    const placements = fillModules(slots, modulesFile());
    expect(placements).toHaveLength(2);
    const [m1, m2] = placements;
    expect(m1!.slots.length).toBeGreaterThan(0);
    expect(m2!.slots.length).toBeGreaterThan(0);
    const lastM1Date = m1!.slots.at(-1)!.date;
    const firstM2Date = m2!.slots[0]!.date;
    expect(firstM2Date > lastM1Date).toBe(true);
    const allDates = placements.flatMap((p) => p.slots.map((s) => s.date));
    expect(new Set(allDates).size).toBe(allDates.length);
  });

  it('reserves repetition-ratio review slots at the start of a module, proportional to the ratio', () => {
    const slots: TeachingSlot[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      capacity: 1,
      weight: 1,
    }));
    const mf = modulesFile({
      total_weeks: 10,
      modules: [
        {
          id: 'm1',
          title: 'Module One',
          weeks: 5,
          content_fields: [],
          goals: [],
          covers: [],
          milestone: { type: 'test', assesses: [] },
          pedagogy: { new_grammar: [] },
        },
        {
          id: 'm2',
          title: 'Module Two',
          weeks: 5,
          content_fields: [],
          goals: [],
          covers: [],
          milestone: { type: 'test', assesses: [] },
          pedagogy: { repetition_ratio: 0.3, new_grammar: [] },
        },
      ],
    });
    const placements = fillModules(slots, mf);
    const m2 = placements.find((p) => p.moduleId === 'm2')!;
    const reviewSlots = m2.slots.filter((s) => s.phase === 'review');
    const expectedCount = Math.round(0.3 * m2.slots.length);
    expect(reviewSlots.length).toBe(expectedCount);
    // Review slots must be at the start, not scattered or at the end.
    expect(m2.slots.slice(0, reviewSlots.length).every((s) => s.phase === 'review')).toBe(true);
    // m1 has no repetition_ratio set - no review slots reserved.
    const m1 = placements.find((p) => p.moduleId === 'm1')!;
    expect(m1.slots.some((s) => s.phase === 'review')).toBe(false);
  });
});

describe('computeBudgets', () => {
  it('converts module weeks into a weight budget of weeks * weekly_lessons', () => {
    const budgets = computeBudgets(modulesFile());
    expect(budgets).toEqual({ m1: 2, m2: 2 });
  });
});
