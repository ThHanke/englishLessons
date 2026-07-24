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
  draft: true;
}

export interface ClassFile {
  name: string;
  grade: number;
  track?: string;
  curriculum: string;
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
