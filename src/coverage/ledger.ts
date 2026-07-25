import type { ModulesFile } from '../schema/types.ts';
import type { CoverageLedger, LedgerDepth, LedgerEntry, LessonCoverage } from './types.ts';

const DEPTH_ORDER: LedgerDepth[] = ['planned', 'introduced', 'practiced', 'assessed', 'mastered'];

/**
 * Implementation-time classification (02-projection.md doesn't enumerate exercise types):
 * an exercise type counts as "productive" for produce-depth satisfaction when it requires the
 * pupil to generate language (write/speak/correct), not just recognise or select it. Matches
 * §3.7a's own worked example, where `practiced via reading_comprehension` (receptive) does not
 * satisfy a produce requirement.
 */
const PRODUCTIVE_EXERCISE_TYPES = new Set([
  'gap_fill',
  'error_correction',
  'writing_prompt',
  'dialogue',
  'mediation',
  'creative_writing',
  'email',
  'diary_entry',
  'poster',
  'report',
  'description',
  'story',
  'argumentative_text',
  'role_cards',
]);

function maxDepth(a: LedgerDepth, b: LedgerDepth): LedgerDepth {
  return DEPTH_ORDER.indexOf(b) > DEPTH_ORDER.indexOf(a) ? b : a;
}

/**
 * A `produce`-required competence is met at ledger depth `practiced` only via a productive
 * exercise type (or at `assessed`/`mastered`, which always count). `understand` is met by any
 * `practiced` exposure.
 */
export function meetsRequiredDepth(entry: LedgerEntry | undefined, requiredDepth: 'understand' | 'produce'): boolean {
  if (!entry) return false;
  if (entry.maxDepth === 'mastered' || entry.maxDepth === 'assessed') return true;
  if (entry.maxDepth !== 'practiced') return false;
  if (requiredDepth === 'understand') return true;
  return entry.exerciseTypesUsed.some((t) => PRODUCTIVE_EXERCISE_TYPES.has(t));
}

/**
 * §3.7a/b: folds per-lesson `covered[]` records into per-competence max depth and per-module
 * `% at required depth`. `masteredOverrides` are teacher-set only (§3.7 - "the automated ledger
 * never infers mastery") and always win over any depth derived from `covered[]`.
 */
export function coverageLedger(lessons: LessonCoverage[], modulesFile: ModulesFile, masteredOverrides: string[] = []): CoverageLedger {
  const competences: Record<string, LedgerEntry> = {};

  for (const lesson of lessons) {
    for (const record of lesson.covered) {
      const existing = competences[record.competence];
      if (!existing) {
        competences[record.competence] = {
          competenceId: record.competence,
          maxDepth: record.depth,
          datesTouched: [lesson.date],
          exerciseTypesUsed: [...record.via],
        };
      } else {
        existing.maxDepth = maxDepth(existing.maxDepth, record.depth);
        if (!existing.datesTouched.includes(lesson.date)) existing.datesTouched.push(lesson.date);
        for (const via of record.via) {
          if (!existing.exerciseTypesUsed.includes(via)) existing.exerciseTypesUsed.push(via);
        }
      }
    }
  }

  for (const id of masteredOverrides) {
    const existing = competences[id];
    if (existing) {
      existing.maxDepth = 'mastered';
    } else {
      competences[id] = { competenceId: id, maxDepth: 'mastered', datesTouched: [], exerciseTypesUsed: [] };
    }
  }

  const modules = modulesFile.modules.map((module) => {
    const metCount = module.covers.filter((cover) => meetsRequiredDepth(competences[cover.id], cover.required_depth)).length;
    return {
      moduleId: module.id,
      targetCount: module.covers.length,
      metCount,
      percentAtRequiredDepth: module.covers.length === 0 ? 0 : Math.round((metCount / module.covers.length) * 100),
    };
  });

  return { competences, modules };
}
