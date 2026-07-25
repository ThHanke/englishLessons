import { describe, it, expect } from 'vitest';
import type { ModulesFile } from '../../schema/types.ts';
import { buildLedger } from './buildLedger.ts';

const FIXTURE_REPO_ROOT = new URL('./fixtures/ledger-repo/', import.meta.url).pathname;

function modulesFile(overrides: Partial<ModulesFile> = {}): ModulesFile {
  return {
    class: 'class-a',
    curriculum: 'fixture-curriculum',
    total_weeks: 4,
    weekly_lessons: 3,
    buffer_weeks: 0,
    modules: [
      {
        id: 'm1',
        title: 'Module One',
        weeks: 2,
        content_fields: [],
        goals: [],
        covers: [
          { id: 'c.x', required_depth: 'understand' },
          { id: 'c.y', required_depth: 'produce' },
        ],
        milestone: { type: 'test', assesses: ['c.x', 'c.y'] },
        pedagogy: { new_grammar: [] },
      },
    ],
    ...overrides,
  };
}

describe('buildLedger', () => {
  it('folds every scanned lesson-spec.json (recursively) into the ledger at depth "introduced"', () => {
    const ledger = buildLedger('class-a', modulesFile(), FIXTURE_REPO_ROOT);
    expect(ledger.competences['c.x']!.maxDepth).toBe('introduced');
    expect(ledger.competences['c.y']!.maxDepth).toBe('introduced');
    expect(ledger.competences['c.x']!.exerciseTypesUsed).toEqual(['gap_fill']);
    expect(ledger.competences['c.y']!.exerciseTypesUsed).toEqual(['writing_prompt']);
  });

  it('never folds a lesson-spec-derived record above "introduced", so a produce-required competence never counts as met from plan artifacts alone', () => {
    const ledger = buildLedger('class-a', modulesFile(), FIXTURE_REPO_ROOT);
    const m1 = ledger.modules.find((m) => m.moduleId === 'm1')!;
    // c.x (understand) and c.y (produce) both only ever reach 'introduced' via scanned specs -
    // meetsRequiredDepth never returns true below 'practiced', so metCount stays 0.
    expect(m1.metCount).toBe(0);
  });

  it('returns an empty-but-valid ledger, not a throw, when the class has no artifacts/<className> directory on disk', () => {
    const ledger = buildLedger('a-class-with-no-artifacts-dir', modulesFile({ class: 'a-class-with-no-artifacts-dir' }), FIXTURE_REPO_ROOT);
    expect(ledger).toEqual({
      competences: {},
      modules: [
        { moduleId: 'm1', targetCount: 2, metCount: 0, percentAtRequiredDepth: 0 },
      ],
    });
  });
});
