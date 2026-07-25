export interface TeachingSlot {
  date: string;
  capacity: number;
  weight: number;
}

export type Phase = 'new_input' | 'practice' | 'consolidation' | 'assessment' | 'review';

export interface PlacedSlot extends TeachingSlot {
  moduleId: string;
  weekInModule: number;
  phase: Phase;
}

export interface MilestoneShift {
  originalDate: string;
  placedDate: string;
  shiftedSlots: number;
}

export interface ModulePlacement {
  moduleId: string;
  slots: PlacedSlot[];
  milestoneDate: string | null;
  milestoneShift: MilestoneShift | null;
}

export interface Projection {
  placements: ModulePlacement[];
}

export interface WeekTableRow {
  date: string;
  moduleId: string;
  weekInModule: number;
  phase: Phase;
  weight: number;
}

export interface WhichModuleResult {
  date: string;
  moduleId: string | null;
  weekInModule: number | null;
  phase: Phase | null;
  reason: string;
}

export interface CalendarDrift {
  asOfDate: string;
  plannedSlotIndex: number;
  actualSlotIndex: number;
  behindBySlots: number;
}
