import type { ModulesFile, Module } from '../schema/types.ts';
import type { TeachingSlot, PlacedSlot, ModulePlacement, MilestoneShift, Phase } from './types.ts';

/** Step 3: `module.budget = module.weeks * weekly_lessons`, in the same weight units as slots. */
export function computeBudgets(modulesFile: ModulesFile): Record<string, number> {
  const weeklyLessons = modulesFile.weekly_lessons as number;
  const budgets: Record<string, number> = {};
  for (const module of modulesFile.modules) {
    budgets[module.id] = (module.weeks as number) * weeklyLessons;
  }
  return budgets;
}

function isHealthy(slot: TeachingSlot): boolean {
  return slot.weight === slot.capacity;
}

/**
 * Step 5's phase heuristic: repetition-ratio share of early slots is `review` of the prior
 * module; of the rest, first third `new_input`, middle third `practice`, final third
 * `consolidation`; the milestone's actual slot (if any) is always `assessment`.
 */
function tagPhase(slots: TeachingSlot[], module: Module, weeklyLessons: number, milestoneDate: string | null): PlacedSlot[] {
  const n = slots.length;
  const reviewCount = Math.round((module.pedagogy.repetition_ratio ?? 0) * n);
  const restCount = n - reviewCount;
  const newInputCount = Math.ceil(restCount / 3);
  const practiceCount = Math.ceil((restCount - newInputCount) / 2);

  return slots.map((slot, i) => {
    let phase: Phase;
    if (i < reviewCount) {
      phase = 'review';
    } else {
      const j = i - reviewCount;
      if (j < newInputCount) phase = 'new_input';
      else if (j < newInputCount + practiceCount) phase = 'practice';
      else phase = 'consolidation';
    }
    if (milestoneDate && slot.date === milestoneDate) phase = 'assessment';
    return { ...slot, moduleId: module.id, weekInModule: Math.floor(i / weeklyLessons) + 1, phase };
  });
}

/**
 * Steps 4-6: walk weighted slots in date order, consuming each module's budget in sequence,
 * then place each module's milestone. A milestone whose naive last slot is degraded (weight <
 * capacity) shifts forward-only to the next healthy slot found anywhere later in the slot
 * sequence (KTD6 - never earlier, since that could place a test before its assessed competence
 * was taught). No explicit "next module's new_input boundary" check is needed: the search is
 * simply unbounded forward, and whatever slots it consumes are absorbed into the current
 * module's placement - which is exactly what "compress/delay the next module" means, since the
 * next module's fill starts from whatever slot is left over.
 */
export function fillModules(weightedSlots: TeachingSlot[], modulesFile: ModulesFile): ModulePlacement[] {
  const budgets = computeBudgets(modulesFile);
  const weeklyLessons = modulesFile.weekly_lessons as number;
  let cursor = 0;
  const placements: ModulePlacement[] = [];

  for (const module of modulesFile.modules) {
    const budget = budgets[module.id]!;
    const moduleSlots: TeachingSlot[] = [];
    let consumed = 0;
    while (cursor < weightedSlots.length && consumed < budget) {
      const slot = weightedSlots[cursor]!;
      moduleSlots.push(slot);
      consumed += slot.weight;
      cursor++;
    }

    let milestoneShift: MilestoneShift | null = null;
    let milestoneDate: string | null = null;

    if (module.milestone.type !== 'none' && moduleSlots.length > 0) {
      const candidate = moduleSlots[moduleSlots.length - 1]!;
      if (isHealthy(candidate)) {
        milestoneDate = candidate.date;
      } else {
        let searchIdx = cursor;
        while (searchIdx < weightedSlots.length && !isHealthy(weightedSlots[searchIdx]!)) {
          searchIdx++;
        }
        if (searchIdx < weightedSlots.length) {
          const extra = weightedSlots.slice(cursor, searchIdx + 1);
          moduleSlots.push(...extra);
          const found = weightedSlots[searchIdx]!;
          milestoneDate = found.date;
          milestoneShift = { originalDate: candidate.date, placedDate: found.date, shiftedSlots: extra.length };
          cursor = searchIdx + 1;
        } else {
          // No healthy slot anywhere before the school year ends - leave the milestone on the
          // last available slot rather than crashing; it stays flagged via milestoneShift=null
          // and the (degraded) candidate date.
          milestoneDate = candidate.date;
        }
      }
    }

    placements.push({
      moduleId: module.id,
      slots: tagPhase(moduleSlots, module, weeklyLessons, milestoneDate),
      milestoneDate,
      milestoneShift,
    });
  }

  return placements;
}
