export type Mode = 'understand' | 'produce';
export const MODE_VALUES: readonly Mode[] = ['understand', 'produce'];

export type UsedIn =
  | 'module_construction'
  | 'lesson_planning'
  | 'base_material'
  | 'test_generation';
export const USED_IN_VALUES: readonly UsedIn[] = [
  'module_construction',
  'lesson_planning',
  'base_material',
  'test_generation',
];

export interface Source {
  doc: string;
  location: string;
}

export interface CurriculumMeta {
  state: string;
  school_type: string;
  subject: string;
  valid_from: string;
  source_file: string;
  cefr_targets: Record<string, string>;
}

export interface CompetenceEntry {
  id: string;
  skill_area: 'listening' | 'reading' | 'speaking' | 'writing' | 'mediation' | 'intercultural';
  statement: string;
  mode: Mode[];
  source: Source;
  used_in: UsedIn[];
}

export interface GrammarItem {
  id: string;
  topic: string;
  mode: Mode[];
  source: Source;
  used_in: UsedIn[];
}

export interface ContentField {
  id: string;
  field: string;
  text: string;
  source: Source;
  used_in: UsedIn[];
}

export interface TaskPatternPointer {
  id: string;
  format: string;
  afb: string;
  skill_area: string;
  source: Source;
  used_in: UsedIn[];
}

export interface HintMethod {
  id: string;
  text: string;
  source: Source;
  used_in: UsedIn[];
}

export interface ReferenceEntry {
  id: string;
  citation: string;
  source: Source;
  used_in: UsedIn[];
}

export interface CompetenceAreas {
  funktional_kommunikativ: {
    kommunikativ: CompetenceEntry[];
    sprachliche_mittel: {
      grammatik: GrammarItem[];
      wortschatz: GrammarItem[];
      aussprache: GrammarItem[];
      orthografie: GrammarItem[];
    };
  };
  interkulturell: {
    anforderungen: CompetenceEntry[];
    orientierungswissen: ContentField[];
  };
  methodisch: HintMethod[];
}

export interface GradeBand {
  id: string;
  grades: number[];
  track?: string;
  cefr_target: string;
  competence_areas: CompetenceAreas;
  content_fields: ContentField[];
  text_types: {
    receptive: string[];
    productive: string[];
  };
}

export interface Covers {
  id: string;
  required_depth: 'understand' | 'produce';
}

export interface Milestone {
  type: 'test' | 'project' | 'presentation' | 'none';
  grade_weight?: number;
  assesses: string[];
}

export interface Pedagogy {
  repetition_ratio?: number;
  new_grammar: string[];
}

/**
 * `weeks` is a DRAFT sentinel in Phase 0 (KTD7) — the literal string 'DRAFT'
 * stands in for the Phase-1-filled number.
 */
export interface Module {
  id: string;
  title: string;
  weeks: number | 'DRAFT';
  content_fields: string[];
  goals: string[];
  covers: Covers[];
  milestone: Milestone;
  pedagogy: Pedagogy;
  draft?: boolean;
}

export interface ModulesFile {
  class: string;
  curriculum: string;
  total_weeks: number | 'DRAFT';
  weekly_lessons: number | 'DRAFT';
  modules: Module[];
  buffer_weeks: number | 'DRAFT';
  draft?: boolean;
}

export interface ClassFile {
  name: string;
  grade: number;
  track?: string;
  curriculum: string;
}

export interface Holiday {
  name: string;
  from: string;
  to: string;
}

export interface CalendarEvent {
  name: string;
  from?: string;
  to?: string;
  date?: string;
  capacity: number;
}

export interface PaceFactors {
  pre_holiday_days: number;
  pre_holiday_factor: number;
  post_holiday_days: number;
  post_holiday_factor: number;
}

export interface LessonSlot {
  id: string;
  day: string;
  start: string;
  end: string;
  half_year: 1 | 2;
}

export interface ClassScheduleEntry {
  lesson_days?: string[];
  lesson_slots?: LessonSlot[];
}

export interface CalendarFile {
  state: string;
  school_year: string;
  first_school_day: string;
  last_school_day: string;
  half_year_boundary?: string;
  holidays: Holiday[];
  events: CalendarEvent[];
  pace_factors: PaceFactors;
  class_schedule: Record<string, ClassScheduleEntry>;
}

/** §3.4 — a single dated lesson-spec export, the contract handed to the generator (Phase 3). */
export interface LessonSpec {
  class: string;
  date: string;
  school_week: number;
  module: { id: string; title: string; week_in_module: number; of: number };
  phase: string;
  pace_factor: number;
  pace_reason: string;
  focus_competences: Array<{ id: string; topic: string; mode: Mode[] }>;
  content_field: { id: string; text: string };
  text_types: string[];
  milestone_context: { next: string; in_slots: number; assesses: string[] };
  prior_covered: string[];
  cefr_target: string;
  known_vocab_ref: string;
  textbook_refs: Array<{ book: string; citation: string; slot: string }>;
  suggested_exercise_types: string[];
  curriculum_ref: string;
}

export interface VocabularyFile {
  class: string;
  inherits_from: string | null;
  cumulative: true;
  generated_from: {
    curriculum: string;
    method: 'agent-role-assignment';
  };
  required_leveling: {
    frequency_list: string;
  };
  modules: Record<string, string[]>;
  taught_through: string;
  overrides?: {
    add: string[];
    remove: string[];
  };
}
