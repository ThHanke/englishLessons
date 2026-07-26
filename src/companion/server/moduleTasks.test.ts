import { describe, it, expect } from 'vitest';
import { moduleTasks } from './moduleTasks.ts';

const FIXTURE_REPO_ROOT = new URL('./fixtures/repo/', import.meta.url).pathname;

describe('moduleTasks', () => {
  it('returns one task per module placement, across every class', () => {
    const { classes, tasks } = moduleTasks({ from: '2026-08-01', to: '2026-09-30', repoRoot: FIXTURE_REPO_ROOT });

    expect(classes.map((c) => c.id).sort()).toEqual(['fixture-class', 'fixture-class-no-artifacts']);
    const byClass = (id: string) => tasks.filter((t) => t.classId === id);
    expect(byClass('fixture-class').map((t) => t.moduleId).sort()).toEqual(['m1', 'm2']);
    expect(byClass('fixture-class-no-artifacts').map((t) => t.moduleId)).toEqual(['m1']);
  });

  it('spans a task from its placement\'s first to last slot date, with the module title', () => {
    const { tasks } = moduleTasks({ from: '2026-08-01', to: '2026-09-30', repoRoot: FIXTURE_REPO_ROOT });
    const m1 = tasks.find((t) => t.classId === 'fixture-class' && t.moduleId === 'm1')!;

    expect(m1.moduleTitle).toBe('Module One');
    expect(m1.startDate <= m1.endDate).toBe(true);
    expect(m1.startDate).toMatch(/^2026-08/);
  });

  it('lists already-planned lesson-spec dates within a task\'s range', () => {
    const { tasks } = moduleTasks({ from: '2026-08-01', to: '2026-09-30', repoRoot: FIXTURE_REPO_ROOT });
    const m1 = tasks.find((t) => t.classId === 'fixture-class' && t.moduleId === 'm1')!;

    expect(m1.plannedDates).toContain('2026-08-05');
  });

  it('excludes tasks entirely outside the requested date range', () => {
    const { tasks } = moduleTasks({ from: '2030-01-01', to: '2030-01-31', repoRoot: FIXTURE_REPO_ROOT });
    expect(tasks).toEqual([]);
  });

  it('still lists a class with no artifacts, with an empty plannedDates for its task', () => {
    const { tasks } = moduleTasks({ from: '2026-08-01', to: '2026-09-30', repoRoot: FIXTURE_REPO_ROOT });
    const noArtifacts = tasks.find((t) => t.classId === 'fixture-class-no-artifacts')!;
    expect(noArtifacts.plannedDates).toEqual([]);
  });
});
