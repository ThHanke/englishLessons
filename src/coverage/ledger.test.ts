import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadYaml } from '../schema/yaml.ts';
import type { ModulesFile } from '../schema/types.ts';
import type { LessonCoverage } from './types.ts';
import { coverageLedger } from './ledger.ts';

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
        weeks: 2,
        content_fields: [],
        goals: [],
        covers: [
          { id: 'c.understand', required_depth: 'understand' },
          { id: 'c.produce', required_depth: 'produce' },
        ],
        milestone: { type: 'none', assesses: [] },
        pedagogy: { new_grammar: [] },
      },
    ],
    ...overrides,
  };
}

describe('coverageLedger folding', () => {
  it('keeps the max depth when the same competence is folded at different depths', () => {
    const lessons: LessonCoverage[] = [
      { date: '2026-09-01', covered: [{ competence: 'c.understand', depth: 'introduced', via: ['gap_fill'] }] },
      { date: '2026-09-03', covered: [{ competence: 'c.understand', depth: 'practiced', via: ['gap_fill'] }] },
    ];
    const ledger = coverageLedger(lessons, modulesFile());
    expect(ledger.competences['c.understand']!.maxDepth).toBe('practiced');
  });

  it('does not count a produce-required competence at practiced via a receptive exercise type', () => {
    const lessons: LessonCoverage[] = [
      { date: '2026-09-01', covered: [{ competence: 'c.produce', depth: 'practiced', via: ['reading_comprehension'] }] },
    ];
    const ledger = coverageLedger(lessons, modulesFile());
    const summary = ledger.modules[0]!;
    expect(summary.metCount).toBe(0);
  });

  it('counts a produce-required competence at practiced via a productive exercise type', () => {
    const lessons: LessonCoverage[] = [
      { date: '2026-09-01', covered: [{ competence: 'c.produce', depth: 'practiced', via: ['writing_prompt'] }] },
    ];
    const ledger = coverageLedger(lessons, modulesFile());
    const summary = ledger.modules[0]!;
    expect(summary.metCount).toBe(1);
  });

  it('counts an understand-required competence at practiced via any exercise type', () => {
    const lessons: LessonCoverage[] = [
      { date: '2026-09-01', covered: [{ competence: 'c.understand', depth: 'practiced', via: ['reading_comprehension'] }] },
    ];
    const ledger = coverageLedger(lessons, modulesFile());
    expect(ledger.competences['c.understand']!.maxDepth).toBe('practiced');
    expect(ledger.modules[0]!.metCount).toBe(1);
  });

  it('preserves a mastered override and never infers it from covered[] depth alone', () => {
    const lessons: LessonCoverage[] = [
      { date: '2026-09-01', covered: [{ competence: 'c.produce', depth: 'assessed', via: ['writing_prompt'] }] },
    ];
    const withoutOverride = coverageLedger(lessons, modulesFile());
    expect(withoutOverride.competences['c.produce']!.maxDepth).toBe('assessed');

    const withOverride = coverageLedger(lessons, modulesFile(), ['c.understand']);
    expect(withOverride.competences['c.understand']!.maxDepth).toBe('mastered');
    // c.produce wasn't in the override list, so it stays at its folded depth, not mastered.
    expect(withOverride.competences['c.produce']!.maxDepth).toBe('assessed');
  });

  it('yields a ledger with every module at 0% for empty covered[] input, no crash', () => {
    const ledger = coverageLedger([], modulesFile());
    expect(ledger.modules[0]!.percentAtRequiredDepth).toBe(0);
    expect(ledger.modules[0]!.metCount).toBe(0);
  });

  it('is idempotent - folding the same record list twice yields the same ledger', () => {
    const lessons: LessonCoverage[] = [
      { date: '2026-09-01', covered: [{ competence: 'c.understand', depth: 'introduced', via: ['gap_fill'] }] },
    ];
    const first = coverageLedger(lessons, modulesFile());
    const second = coverageLedger(lessons, modulesFile());
    expect(first).toEqual(second);
  });
});

describe('coverageLedger against the real hand-authored fixture (KTD5)', () => {
  const fixturePath = new URL('./fixtures/covered-sample.json', import.meta.url).pathname;
  const lessons = JSON.parse(readFileSync(fixturePath, 'utf-8')) as LessonCoverage[];
  const realModulesPath = new URL('../../plans/grade-7-realschule/modules.yaml', import.meta.url).pathname;
  const realModules = loadYaml<ModulesFile>(realModulesPath);

  it('produces the expected max-depth values for hand-checked entries', () => {
    const ledger = coverageLedger(lessons, realModules);
    // fk.g.passive: introduced -> practiced -> assessed, so max is assessed.
    expect(ledger.competences['fk.g.passive']!.maxDepth).toBe('assessed');
    // fk.k.sprechen.1 (produce-required) only ever reached practiced via reading_comprehension
    // (receptive) - does not satisfy its produce requirement.
    expect(ledger.competences['fk.k.sprechen.1']!.maxDepth).toBe('practiced');
  });

  it('computes m1 at 2/5 = 40% at required depth', () => {
    const ledger = coverageLedger(lessons, realModules);
    const m1 = ledger.modules.find((m) => m.moduleId === 'm1')!;
    // Met: fk.g.passive (assessed), fk.k.lesen.1 (understand, practiced). Not met:
    // fk.k.hoer.1 (understand, only introduced), fk.k.sprechen.1 (produce via receptive type),
    // fk.w.open_continue_close_conversations (never covered).
    expect(m1.targetCount).toBe(5);
    expect(m1.metCount).toBe(2);
    expect(m1.percentAtRequiredDepth).toBe(40);
  });
});
