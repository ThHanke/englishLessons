export type CoverageDepth = 'introduced' | 'practiced' | 'assessed';

export interface CoveredRecord {
  competence: string;
  depth: CoverageDepth;
  via: string[];
}

export interface LessonCoverage {
  date: string;
  covered: CoveredRecord[];
  topics?: string[];
  vocab_introduced?: string[];
}

export type LedgerDepth = 'planned' | 'introduced' | 'practiced' | 'assessed' | 'mastered';

export interface LedgerEntry {
  competenceId: string;
  maxDepth: LedgerDepth;
  datesTouched: string[];
  exerciseTypesUsed: string[];
}

export interface ModuleCoverageSummary {
  moduleId: string;
  targetCount: number;
  metCount: number;
  percentAtRequiredDepth: number;
}

export interface CoverageLedger {
  competences: Record<string, LedgerEntry>;
  modules: ModuleCoverageSummary[];
}

export type GapKind = 'uncovered' | 'under-depth' | 'at-risk';

export interface Gap {
  competenceId: string;
  moduleId: string;
  kind: GapKind;
  requiredDepth: 'understand' | 'produce';
  currentDepth: LedgerDepth | null;
}

export interface GapReport {
  asOfDate: string;
  gaps: Gap[];
}

export interface CalendarDrift {
  asOfDate: string;
  plannedSlotIndex: number;
  actualSlotIndex: number;
  behindBySlots: number;
}

export interface DriftReport {
  asOfDate: string;
  calendarDrift: CalendarDrift;
  coverageGaps: Gap[];
  onTrack: boolean;
}
