import type { GradeBand, ModulesFile, VocabularyFile } from '../schema/types.ts';
import type { Issue } from './curriculumValidator.ts';
import { collectBandEntryIds } from './curriculumValidator.ts';

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

function checkTimeFields(modulesFile: ModulesFile, filePath: string): Issue[] {
  const timeFieldsAreDraft =
    modulesFile.total_weeks === 'DRAFT' ||
    modulesFile.buffer_weeks === 'DRAFT' ||
    modulesFile.modules.some((m) => m.weeks === 'DRAFT');

  if (timeFieldsAreDraft) {
    return [
      {
        severity: 'deferred',
        code: 'time_fields_draft',
        message: 'Time fields are DRAFT (KTD7) — weeks-sum/weekly_lessons checks deferred to Phase 1',
        file: filePath,
      },
    ];
  }

  const sum =
    modulesFile.modules.reduce((acc, m) => acc + (m.weeks as number), 0) +
    (modulesFile.buffer_weeks as number);
  if (sum !== modulesFile.total_weeks) {
    return [
      {
        severity: 'error',
        code: 'weeks_sum_mismatch',
        message: `sum(module.weeks) + buffer_weeks (${sum}) != total_weeks (${modulesFile.total_weeks})`,
        file: filePath,
      },
    ];
  }
  return [];
}

function checkReferences(modulesFile: ModulesFile, bandIds: Set<string>, modulesFilePath: string): Issue[] {
  const issues: Issue[] = [];
  for (const module of modulesFile.modules) {
    for (const cover of module.covers) {
      if (!bandIds.has(cover.id)) {
        issues.push({
          severity: 'error',
          code: 'dangling_covers',
          message: `Module "${module.id}" covers unknown id "${cover.id}"`,
          file: modulesFilePath,
          id: cover.id,
        });
      }
    }
    for (const assessed of module.milestone.assesses) {
      if (!bandIds.has(assessed)) {
        issues.push({
          severity: 'error',
          code: 'dangling_assesses',
          message: `Module "${module.id}" milestone assesses unknown id "${assessed}"`,
          file: modulesFilePath,
          id: assessed,
        });
      }
    }
  }
  return issues;
}

function checkCoverageLint(modulesFile: ModulesFile, band: GradeBand, modulesFilePath: string): Issue[] {
  const issues: Issue[] = [];
  const produceGrammarIds = band.competence_areas.funktional_kommunikativ.sprachliche_mittel.grammatik
    .filter((g) => g.mode.includes('produce'))
    .map((g) => g.id);

  const modules = modulesFile.modules;
  for (const gid of produceGrammarIds) {
    const coverIdx = modules.findIndex((m) =>
      m.covers.some((c) => c.id === gid && c.required_depth === 'produce'),
    );
    const assessIdx = modules.findIndex((m) => m.milestone.assesses.includes(gid));

    if (coverIdx === -1) {
      issues.push({
        severity: 'error',
        code: 'produce_not_covered',
        message: `Produce-mode grammar item "${gid}" is not covered at required_depth=produce by any module`,
        file: modulesFilePath,
        id: gid,
      });
      continue;
    }
    if (assessIdx !== -1 && assessIdx < coverIdx) {
      issues.push({
        severity: 'error',
        code: 'produce_covered_after_milestone',
        message: `Produce-mode grammar item "${gid}" is covered at module index ${coverIdx} but assessed earlier at module index ${assessIdx}`,
        file: modulesFilePath,
        id: gid,
      });
    }
  }
  return issues;
}

export function validateModulesReferential(params: {
  modulesFile: ModulesFile;
  modulesFilePath: string;
  band: GradeBand;
}): Issue[] {
  const { modulesFile, modulesFilePath, band } = params;
  const bandIds = collectBandEntryIds(band);
  return [
    ...checkReferences(modulesFile, bandIds, modulesFilePath),
    ...checkCoverageLint(modulesFile, band, modulesFilePath),
    ...checkTimeFields(modulesFile, modulesFilePath),
  ];
}

export function validateVocabReference(params: {
  vocab: VocabularyFile;
  vocabFilePath: string;
  knownCurriculumIds: Set<string>;
}): Issue[] {
  const { vocab, vocabFilePath, knownCurriculumIds } = params;
  if (!knownCurriculumIds.has(vocab.generated_from.curriculum)) {
    return [
      {
        severity: 'error',
        code: 'vocab_unknown_curriculum',
        message: `generated_from.curriculum "${vocab.generated_from.curriculum}" does not match any known curriculum band`,
        file: vocabFilePath,
      },
    ];
  }
  return [];
}

function ownWords(v: VocabularyFile): Set<string> {
  const set = new Set<string>();
  for (const words of Object.values(v.modules)) {
    for (const w of words) set.add(normalizeWord(w));
  }
  if (v.overrides?.add) {
    for (const w of v.overrides.add) set.add(normalizeWord(w));
  }
  return set;
}

function removedWords(v: VocabularyFile): Set<string> {
  return new Set((v.overrides?.remove ?? []).map(normalizeWord));
}

type ResolveResult = Set<string> | 'cycle' | 'missing';

/** Chain-ordered (KTD8) validator: inherits_from resolves + acyclic, no re-introduction, no un-knowing via overrides.remove. */
export function validateVocabChain(
  files: Record<string, VocabularyFile>,
  filePaths: Record<string, string>,
): Issue[] {
  const issues: Issue[] = [];
  const memo = new Map<string, ResolveResult>();

  function resolveAncestorFull(grade: string, visiting: Set<string>): ResolveResult {
    if (memo.has(grade)) return memo.get(grade)!;
    const file = files[grade];
    if (!file) return 'missing';
    if (visiting.has(grade)) return 'cycle';
    visiting.add(grade);

    let full = new Set<string>();
    if (file.inherits_from) {
      const parent = resolveAncestorFull(file.inherits_from, visiting);
      if (parent === 'cycle' || parent === 'missing') {
        visiting.delete(grade);
        return parent;
      }
      full = new Set(parent);
    }
    for (const w of ownWords(file)) full.add(w);
    for (const w of removedWords(file)) full.delete(w);

    visiting.delete(grade);
    memo.set(grade, full);
    return full;
  }

  for (const [grade, file] of Object.entries(files)) {
    const filePath = filePaths[grade] ?? grade;

    if (file.inherits_from && !files[file.inherits_from]) {
      issues.push({
        severity: 'error',
        code: 'vocab_chain_missing_ancestor',
        message: `${grade}'s inherits_from "${file.inherits_from}" does not resolve to a known vocab file`,
        file: filePath,
      });
      continue;
    }

    const ancestorResult: ResolveResult = file.inherits_from
      ? resolveAncestorFull(file.inherits_from, new Set([grade]))
      : new Set<string>();

    if (ancestorResult === 'cycle') {
      issues.push({
        severity: 'error',
        code: 'vocab_chain_cycle',
        message: `Cycle detected in vocab inherits_from chain starting at ${grade}`,
        file: filePath,
      });
      continue;
    }
    if (ancestorResult === 'missing') {
      issues.push({
        severity: 'error',
        code: 'vocab_chain_missing_ancestor',
        message: `${grade}'s inherits_from chain references a missing vocab file`,
        file: filePath,
      });
      continue;
    }

    const ancestorFull = ancestorResult;
    for (const w of ownWords(file)) {
      if (ancestorFull.has(w)) {
        issues.push({
          severity: 'error',
          code: 'vocab_reintroduction',
          message: `Word "${w}" in ${grade} is already known via its inherited chain (re-introduction)`,
          file: filePath,
          id: w,
        });
      }
    }

    for (const w of removedWords(file)) {
      if (ancestorFull.has(w)) {
        issues.push({
          severity: 'error',
          code: 'vocab_monotonicity_broken',
          message: `Word "${w}" removed by ${grade}'s overrides.remove was already known via its inherited chain (nothing already known may become un-known)`,
          file: filePath,
          id: w,
        });
      }
    }
  }

  return issues;
}
