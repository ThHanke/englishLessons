import { describe, it, expect } from 'vitest';
import { dateContext, type TeachingDayContext } from './dateContext.ts';

const FIXTURE_REPO_ROOT = new URL('./fixtures/repo/', import.meta.url).pathname;

describe('dateContext', () => {
  it('returns moduleId, weekInModule, phase, and that module\'s gap-report entries for a date with an active module', () => {
    const ctx = dateContext({ className: 'fixture-class', date: '2026-08-03', repoRoot: FIXTURE_REPO_ROOT });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.moduleId).toBe('m1');
    expect(teaching.weekInModule).toBe(1);
    expect(teaching.phase).toBe('new_input');
    // c.uncovered is never touched by any scanned lesson-spec -> always uncovered.
    expect(teaching.gaps.find((g) => g.competenceId === 'c.uncovered')?.kind).toBe('uncovered');
    // c.underdepth was touched by the 2026-08-05 lesson-spec fixture (depth capped at
    // 'introduced'), which never meets a produce requirement -> under-depth or at-risk, never
    // absent. At 2026-08-03 the m1 milestone (2026-08-14) is 5 slots away, outside the default
    // 4-slot at-risk window, so it classifies as under-depth here.
    expect(teaching.gaps.find((g) => g.competenceId === 'c.underdepth')?.kind).toBe('under-depth');
    // gaps are scoped to the active module (m1) only.
    expect(teaching.gaps.every((g) => g.moduleId === 'm1')).toBe(true);
  });

  it('includes the at-risk gap classification, not just uncovered/under-depth, for a date near a milestone', () => {
    // 2026-08-10 is 2 teaching slots before m1's 2026-08-14 milestone - inside the default
    // 4-slot at-risk window.
    const ctx = dateContext({ className: 'fixture-class', date: '2026-08-10', repoRoot: FIXTURE_REPO_ROOT });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.moduleId).toBe('m1');
    expect(teaching.gaps.find((g) => g.competenceId === 'c.underdepth')?.kind).toBe('at-risk');
  });

  it('includes a reference to an existing lesson-spec.json for the date', () => {
    const ctx = dateContext({ className: 'fixture-class', date: '2026-08-05', repoRoot: FIXTURE_REPO_ROOT });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.lessonSpecPath).toBe('artifacts/fixture-class/2026-08-05/lesson-spec.json');
    expect(teaching.lessonSpec).not.toBeNull();
    expect(teaching.lessonSpec!.date).toBe('2026-08-05');
  });

  it('returns context with no artifact reference for a date with no lesson-spec yet', () => {
    const ctx = dateContext({ className: 'fixture-class', date: '2026-08-07', repoRoot: FIXTURE_REPO_ROOT });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.lessonSpecPath).toBeNull();
    expect(teaching.lessonSpec).toBeNull();
  });

  it('flags a holiday/weekend/non-teaching date distinctly (isTeachingDay: false) so the caller can skip opening a chat session', () => {
    // 2026-08-08 is a Saturday - not in fixture-class's Mon/Wed/Fri lesson_days.
    const ctx = dateContext({ className: 'fixture-class', date: '2026-08-08', repoRoot: FIXTURE_REPO_ROOT });
    expect(ctx.isTeachingDay).toBe(false);
    if (ctx.isTeachingDay) throw new Error('unreachable');
    expect(ctx.reason).toMatch(/holiday, weekend, or outside the school year/);
    // Discriminated union: no moduleId/gaps field leaks onto the non-teaching branch.
    expect((ctx as unknown as Record<string, unknown>).moduleId).toBeUndefined();
  });

  it('builds an empty-but-valid ledger (no throw) for a class with no lesson-spec.json artifacts on disk', () => {
    const ctx = dateContext({ className: 'fixture-class-no-artifacts', date: '2026-08-03', repoRoot: FIXTURE_REPO_ROOT });
    expect(ctx.isTeachingDay).toBe(true);
    const teaching = ctx as TeachingDayContext;
    expect(teaching.moduleId).toBe('m1');
    // With an empty ledger, every target competence is uncovered.
    expect(teaching.gaps.find((g) => g.competenceId === 'c.uncovered')?.kind).toBe('uncovered');
    expect(teaching.lessonSpecPath).toBeNull();
  });
});
