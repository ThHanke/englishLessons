import type { ModulesFile } from '../schema/types.ts';
import type { ModulePlacement } from '../projection/types.ts';
import { weekTable } from '../projection/query.ts';
import type { CoverageLedger, Gap, GapReport } from './types.ts';
import { meetsRequiredDepth } from './ledger.ts';

/** ~1-2 teaching weeks at 3x/week. 02-projection.md doesn't pin a number (Open Questions) - this
 * is an implementation-time default, not a product decision. */
const DEFAULT_AT_RISK_WINDOW_SLOTS = 4;

function slotIndexAtOrAfter(rows: Array<{ date: string }>, date: string): number {
  const idx = rows.findIndex((r) => r.date >= date);
  return idx === -1 ? rows.length : idx;
}

/**
 * §3.7c: classifies every module's target competences against the ledger into uncovered
 * (never touched), under-depth (touched, below required_depth), and at-risk (under-depth *and*
 * required by a milestone within `atRiskWindowSlots`).
 */
export function gapReport(params: {
  asOfDate: string;
  ledger: CoverageLedger;
  modulesFile: ModulesFile;
  placements: ModulePlacement[];
  atRiskWindowSlots?: number;
}): GapReport {
  const { asOfDate, ledger, modulesFile, placements, atRiskWindowSlots = DEFAULT_AT_RISK_WINDOW_SLOTS } = params;
  const rows = weekTable(placements);
  const asOfIndex = slotIndexAtOrAfter(rows, asOfDate);

  const gaps: Gap[] = [];

  for (const module of modulesFile.modules) {
    const placement = placements.find((p) => p.moduleId === module.id);
    const milestoneDate = placement?.milestoneDate ?? null;
    const milestoneIndex = milestoneDate ? rows.findIndex((r) => r.date === milestoneDate) : -1;
    const slotsToMilestone = milestoneIndex === -1 ? null : milestoneIndex - asOfIndex;

    for (const cover of module.covers) {
      const entry = ledger.competences[cover.id];
      if (!entry) {
        gaps.push({ competenceId: cover.id, moduleId: module.id, kind: 'uncovered', requiredDepth: cover.required_depth, currentDepth: null });
        continue;
      }
      if (meetsRequiredDepth(entry, cover.required_depth)) continue;

      const isNearMilestone = slotsToMilestone !== null && slotsToMilestone >= 0 && slotsToMilestone <= atRiskWindowSlots;
      gaps.push({
        competenceId: cover.id,
        moduleId: module.id,
        kind: isNearMilestone ? 'at-risk' : 'under-depth',
        requiredDepth: cover.required_depth,
        currentDepth: entry.maxDepth,
      });
    }
  }

  return { asOfDate, gaps };
}
