import { describe, it, expect } from 'vitest';
import type { ModulesFile } from '../schema/types.ts';
import type { ModulePlacement, PlacedSlot } from '../projection/types.ts';
import type { CoverageLedger } from './types.ts';
import { driftReport } from './driftReport.ts';

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
        covers: [{ id: 'c1', required_depth: 'understand' }],
        milestone: { type: 'none', assesses: [] },
        pedagogy: { new_grammar: [] },
      },
    ],
  };
}

const dates = Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
const placement: ModulePlacement = {
  moduleId: 'm1',
  slots: dates.map((d) => slot(d)),
  milestoneDate: null,
  milestoneShift: null,
};

describe('driftReport', () => {
  it('reports "behind by N slots" when the actual position trails the planned position', () => {
    const ledger: CoverageLedger = { competences: {}, modules: [] };
    const report = driftReport({
      asOfDate: dates[6]!, // planned position: 7 slots elapsed
      placements: [placement],
      ledger,
      modulesFile: modulesFile(),
      actualLastTaughtDate: dates[3]!, // actual position: 4 slots elapsed
    });
    expect(report.calendarDrift.behindBySlots).toBe(3);
  });

  it('falls back actualSlotIndex to plannedSlotIndex when actualLastTaughtDate is null (no lessons taught yet, KTD5)', () => {
    const ledger: CoverageLedger = { competences: {}, modules: [] };
    const report = driftReport({
      asOfDate: dates[4]!,
      placements: [placement],
      ledger,
      modulesFile: modulesFile(),
      actualLastTaughtDate: null,
    });
    expect(report.calendarDrift.actualSlotIndex).toBe(report.calendarDrift.plannedSlotIndex);
    expect(report.calendarDrift.behindBySlots).toBe(0);
  });

  it('returns a clean/on-track result with zero gaps and zero calendar drift', () => {
    const ledger: CoverageLedger = {
      competences: { c1: { competenceId: 'c1', maxDepth: 'assessed', datesTouched: [dates[0]!], exerciseTypesUsed: [] } },
      modules: [],
    };
    const report = driftReport({
      asOfDate: dates[4]!,
      placements: [placement],
      ledger,
      modulesFile: modulesFile(),
      actualLastTaughtDate: dates[4]!,
    });
    expect(report.calendarDrift.behindBySlots).toBe(0);
    expect(report.coverageGaps).toEqual([]);
    expect(report.onTrack).toBe(true);
  });
});
