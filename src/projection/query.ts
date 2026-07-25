import type { ModulePlacement, WeekTableRow, WhichModuleResult } from './types.ts';

/** `whichModule(date)`: module + week_in_module + phase for a date, or a clear "no lesson" result. */
export function whichModule(placements: ModulePlacement[], date: string): WhichModuleResult {
  for (const placement of placements) {
    const slot = placement.slots.find((s) => s.date === date);
    if (slot) {
      return { date, moduleId: placement.moduleId, weekInModule: slot.weekInModule, phase: slot.phase, reason: 'scheduled lesson' };
    }
  }
  return { date, moduleId: null, weekInModule: null, phase: null, reason: 'no lesson scheduled on this date (holiday, weekend, or outside the school year)' };
}

/** `weekTable()`: one row per teaching slot, in date order across all module placements. */
export function weekTable(placements: ModulePlacement[]): WeekTableRow[] {
  return placements
    .flatMap((placement) => placement.slots.map((slot) => ({ date: slot.date, moduleId: placement.moduleId, weekInModule: slot.weekInModule, phase: slot.phase, weight: slot.weight })))
    .sort((a, b) => a.date.localeCompare(b.date));
}
