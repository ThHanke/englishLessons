import { describe, it, expect } from 'vitest';
import type { ModulesFile } from '../schema/types.ts';
import type { ModulePlacement, PlacedSlot } from '../projection/types.ts';
import type { CoverageLedger } from './types.ts';
import { gapReport } from './gapReport.ts';

function slot(date: string, phase: PlacedSlot['phase'] = 'practice'): PlacedSlot {
  return { date, capacity: 1, weight: 1, moduleId: 'm1', weekInModule: 1, phase };
}

function modulesFile(): ModulesFile {
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
          { id: 'c.uncovered', required_depth: 'understand' },
          { id: 'c.underdepth', required_depth: 'produce' },
        ],
        milestone: { type: 'test', assesses: [] },
        pedagogy: { new_grammar: [] },
      },
    ],
  };
}

function emptyLedger(): CoverageLedger {
  return { competences: {}, modules: [] };
}

describe('gapReport', () => {
  it('classifies a competence never in covered[] as uncovered', () => {
    const placement: ModulePlacement = {
      moduleId: 'm1',
      slots: [slot('2026-09-01'), slot('2026-09-10', 'assessment')],
      milestoneDate: '2026-09-10',
      milestoneShift: null,
    };
    const report = gapReport({ asOfDate: '2026-09-01', ledger: emptyLedger(), modulesFile: modulesFile(), placements: [placement] });
    expect(report.gaps.find((g) => g.competenceId === 'c.uncovered')?.kind).toBe('uncovered');
  });

  it('classifies a produce-required competence at introduced as under-depth when milestone is far away', () => {
    const dates = Array.from({ length: 11 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const placement: ModulePlacement = {
      moduleId: 'm1',
      slots: dates.map((d, i) => slot(d, i === dates.length - 1 ? 'assessment' : 'practice')),
      milestoneDate: dates.at(-1)!,
      milestoneShift: null,
    };
    const ledger: CoverageLedger = {
      competences: { 'c.underdepth': { competenceId: 'c.underdepth', maxDepth: 'introduced', datesTouched: [dates[0]!], exerciseTypesUsed: [] } },
      modules: [],
    };
    // asOfDate at dates[0]: milestone is 10 slots away (> default 4-slot at-risk window).
    const report = gapReport({ asOfDate: dates[0]!, ledger, modulesFile: modulesFile(), placements: [placement] });
    const gap = report.gaps.find((g) => g.competenceId === 'c.underdepth')!;
    expect(gap.kind).toBe('under-depth');
  });

  it('classifies the same under-depth competence as at-risk when the milestone is within the window', () => {
    const dates = ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-08', '2026-09-10'];
    const placement: ModulePlacement = {
      moduleId: 'm1',
      slots: dates.map((d, i) => slot(d, i === dates.length - 1 ? 'assessment' : 'practice')),
      milestoneDate: dates.at(-1)!,
      milestoneShift: null,
    };
    const ledger: CoverageLedger = {
      competences: { 'c.underdepth': { competenceId: 'c.underdepth', maxDepth: 'introduced', datesTouched: [dates[2]!], exerciseTypesUsed: [] } },
      modules: [],
    };
    // asOfDate at dates[2] ('2026-09-05'): milestone (dates[4]) is 2 slots away (<= 4).
    const report = gapReport({ asOfDate: dates[2]!, ledger, modulesFile: modulesFile(), placements: [placement] });
    const gap = report.gaps.find((g) => g.competenceId === 'c.underdepth')!;
    expect(gap.kind).toBe('at-risk');
  });
});
