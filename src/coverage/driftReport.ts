import type { ModulesFile } from '../schema/types.ts';
import type { ModulePlacement } from '../projection/types.ts';
import { weekTable } from '../projection/query.ts';
import type { CoverageLedger, DriftReport } from './types.ts';
import { gapReport } from './gapReport.ts';

function countSlotsUpTo(rows: Array<{ date: string }>, date: string): number {
  return rows.filter((r) => r.date <= date).length;
}

/**
 * 02-projection.md's two-dimensional drift: (1) calendar drift - planned module position
 * (by `asOfDate`) vs actual (by `actualLastTaughtDate`, derived from dated artifacts in Phase
 * 3.5 - here just a parameter); (2) coverage drift, from `gapReport`.
 */
export function driftReport(params: {
  asOfDate: string;
  placements: ModulePlacement[];
  ledger: CoverageLedger;
  modulesFile: ModulesFile;
  actualLastTaughtDate: string | null;
  atRiskWindowSlots?: number;
}): DriftReport {
  const { asOfDate, placements, ledger, modulesFile, actualLastTaughtDate, atRiskWindowSlots } = params;
  const rows = weekTable(placements);

  const plannedSlotIndex = countSlotsUpTo(rows, asOfDate);
  const actualSlotIndex = actualLastTaughtDate ? countSlotsUpTo(rows, actualLastTaughtDate) : plannedSlotIndex;
  const behindBySlots = Math.max(0, plannedSlotIndex - actualSlotIndex);

  const { gaps } = gapReport({ asOfDate, ledger, modulesFile, placements, atRiskWindowSlots });

  return {
    asOfDate,
    calendarDrift: { asOfDate, plannedSlotIndex, actualSlotIndex, behindBySlots },
    coverageGaps: gaps,
    onTrack: behindBySlots === 0 && gaps.length === 0,
  };
}
