import { describe, it, expect } from 'vitest';
import { loadYaml } from '../schema/yaml.ts';
import type { GradeBand, ModulesFile, VocabularyFile } from '../schema/types.ts';
import { validateGradeBand } from './curriculumValidator.ts';
import {
  validateModulesReferential,
  checkCoverageLintAcrossModules,
  validateVocabReference,
  validateVocabChain,
} from './referentialValidator.ts';

const fixturePath = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

function loadBand(): GradeBand {
  return loadYaml<GradeBand>(fixturePath('band.yaml'));
}
function loadModules(): ModulesFile {
  return loadYaml<ModulesFile>(fixturePath('modules-valid.yaml'));
}
function loadVocabChain(): Record<string, VocabularyFile> {
  return {
    'grade-5': loadYaml<VocabularyFile>(fixturePath('vocab-grade-5.yaml')),
    'grade-6': loadYaml<VocabularyFile>(fixturePath('vocab-grade-6.yaml')),
    'grade-7': loadYaml<VocabularyFile>(fixturePath('vocab-grade-7.yaml')),
  };
}

describe('curriculumValidator: valid fixture', () => {
  it('passes with zero errors', () => {
    const band = loadBand();
    const issues = validateGradeBand(band, 'band.yaml');
    expect(issues).toEqual([]);
  });
});

describe('curriculumValidator: schema errors', () => {
  it('flags an entry missing source', () => {
    const band = loadBand();
    delete (band.competence_areas.funktional_kommunikativ.kommunikativ[0] as any).source;
    const issues = validateGradeBand(band, 'band.yaml');
    expect(issues.some((i) => i.code === 'missing_source')).toBe(true);
  });

  it('flags a used_in value outside the allowed set', () => {
    const band = loadBand();
    (band.competence_areas.funktional_kommunikativ.kommunikativ[0] as any).used_in = ['not_a_real_tag'];
    const issues = validateGradeBand(band, 'band.yaml');
    expect(issues.some((i) => i.code === 'invalid_used_in')).toBe(true);
  });

  it('flags a duplicate id within the band', () => {
    const band = loadBand();
    band.content_fields.push({ ...band.content_fields[0]!, id: 'fk.k.hoer.1' });
    const issues = validateGradeBand(band, 'band.yaml');
    expect(issues.some((i) => i.code === 'duplicate_id')).toBe(true);
  });
});

describe('referentialValidator: module <-> band references', () => {
  it('valid modules file against its band passes with zero errors (DRAFT time fields only deferred)', () => {
    const band = loadBand();
    const modulesFile = loadModules();
    const issues = validateModulesReferential({ modulesFile, modulesFilePath: 'modules-valid.yaml', band });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues).toEqual([
      {
        severity: 'deferred',
        code: 'time_fields_draft',
        message: 'Time fields are DRAFT (KTD7) — weeks-sum/weekly_lessons checks deferred to Phase 1',
        file: 'modules-valid.yaml',
      },
    ]);
  });

  it('a module covering an absent id produces an error naming the id and file', () => {
    const band = loadBand();
    const modulesFile = loadModules();
    modulesFile.modules[0]!.covers.push({ id: 'fk.g.does_not_exist', required_depth: 'understand' });
    const issues = validateModulesReferential({ modulesFile, modulesFilePath: 'modules-valid.yaml', band });
    const err = issues.find((i) => i.code === 'dangling_covers');
    expect(err).toBeDefined();
    expect(err!.id).toBe('fk.g.does_not_exist');
    expect(err!.file).toBe('modules-valid.yaml');
  });

  it('a produce-mode grammar item with no producing module before its milestone is a coverage lint error', () => {
    const band = loadBand();
    const modulesFile = loadModules();
    // required_depth downgraded to understand, but the milestone still assesses it as if produced
    modulesFile.modules[0]!.covers[0]!.required_depth = 'understand';
    const issues = checkCoverageLintAcrossModules(
      modulesFile.modules.map((module) => ({ module, filePath: 'modules-valid.yaml' })),
      band,
    );
    expect(issues.some((i) => i.code === 'produce_not_covered' && i.id === 'fk.g.simple_present')).toBe(true);
  });

  it('a produce-mode grammar item covered in a later file in the sequence is fine (split-band case, KTD5)', () => {
    const band = loadBand();
    const grade5Modules = loadModules();
    grade5Modules.modules[0]!.covers = grade5Modules.modules[0]!.covers.filter(
      (c) => c.id !== 'fk.g.simple_present',
    );
    grade5Modules.modules[0]!.milestone.assesses = [];
    const grade6Modules = loadModules();
    grade6Modules.modules[0]!.id = 'm2';

    const ordered = [
      ...grade5Modules.modules.map((module) => ({ module, filePath: 'grade-5-modules.yaml' })),
      ...grade6Modules.modules.map((module) => ({ module, filePath: 'grade-6-modules.yaml' })),
    ];
    const issues = checkCoverageLintAcrossModules(ordered, band);
    expect(issues.filter((i) => i.code === 'produce_not_covered')).toEqual([]);
  });

  it('DRAFT time fields report the weeks-sum check as deferred, not failed', () => {
    const band = loadBand();
    const modulesFile = loadModules();
    const issues = validateModulesReferential({ modulesFile, modulesFilePath: 'modules-valid.yaml', band });
    const deferred = issues.find((i) => i.code === 'time_fields_draft');
    expect(deferred).toBeDefined();
    expect(deferred!.severity).toBe('deferred');
    expect(issues.some((i) => i.code === 'weeks_sum_mismatch')).toBe(false);
  });

  it('non-DRAFT time fields that do not sum correctly are a hard error', () => {
    const band = loadBand();
    const modulesFile = loadModules();
    modulesFile.total_weeks = 10;
    modulesFile.buffer_weeks = 2;
    modulesFile.modules[0]!.weeks = 3;
    const issues = validateModulesReferential({ modulesFile, modulesFilePath: 'modules-valid.yaml', band });
    expect(issues.some((i) => i.code === 'weeks_sum_mismatch')).toBe(true);
  });
});

describe('referentialValidator: vocab <-> curriculum reference', () => {
  it('generated_from.curriculum resolving to a known band passes', () => {
    const vocab = loadYaml<VocabularyFile>(fixturePath('vocab-grade-5.yaml'));
    const issues = validateVocabReference({
      vocab,
      vocabFilePath: 'vocab-grade-5.yaml',
      knownCurriculumIds: new Set(['test.band']),
    });
    expect(issues).toEqual([]);
  });

  it('generated_from.curriculum pointing at an unknown band is an error', () => {
    const vocab = loadYaml<VocabularyFile>(fixturePath('vocab-grade-5.yaml'));
    const issues = validateVocabReference({
      vocab,
      vocabFilePath: 'vocab-grade-5.yaml',
      knownCurriculumIds: new Set(['some.other.band']),
    });
    expect(issues.some((i) => i.code === 'vocab_unknown_curriculum')).toBe(true);
  });
});

describe('referentialValidator: vocab chain (R8/KTD8)', () => {
  it('a valid 5 -> 6 -> 7 chain with disjoint per-grade lists passes clean', () => {
    const files = loadVocabChain();
    const filePaths = {
      'grade-5': 'vocab-grade-5.yaml',
      'grade-6': 'vocab-grade-6.yaml',
      'grade-7': 'vocab-grade-7.yaml',
    };
    const issues = validateVocabChain(files, filePaths);
    expect(issues).toEqual([]);
  });

  it('grade-6 re-listing a word already in grade-5 cumulative set is a re-introduction error naming the word and file', () => {
    const files = loadVocabChain();
    files['grade-6']!.modules.m1!.push('hobby');
    const filePaths = { 'grade-5': 'vocab-grade-5.yaml', 'grade-6': 'vocab-grade-6.yaml', 'grade-7': 'vocab-grade-7.yaml' };
    const issues = validateVocabChain(files, filePaths);
    const err = issues.find((i) => i.code === 'vocab_reintroduction');
    expect(err).toBeDefined();
    expect(err!.id).toBe('hobby');
    expect(err!.file).toBe('vocab-grade-6.yaml');
  });

  it('inherits_from pointing at a missing file is an error', () => {
    const files = loadVocabChain();
    files['grade-6']!.inherits_from = 'grade-4';
    const filePaths = { 'grade-5': 'vocab-grade-5.yaml', 'grade-6': 'vocab-grade-6.yaml', 'grade-7': 'vocab-grade-7.yaml' };
    const issues = validateVocabChain(files, filePaths);
    expect(issues.some((i) => i.code === 'vocab_chain_missing_ancestor' && i.file === 'vocab-grade-6.yaml')).toBe(
      true,
    );
  });

  it('a cycle (6 -> 5 -> 6) is an error', () => {
    const files = loadVocabChain();
    files['grade-5']!.inherits_from = 'grade-6';
    const filePaths = { 'grade-5': 'vocab-grade-5.yaml', 'grade-6': 'vocab-grade-6.yaml', 'grade-7': 'vocab-grade-7.yaml' };
    const issues = validateVocabChain(files, filePaths);
    expect(issues.some((i) => i.code === 'vocab_chain_cycle')).toBe(true);
  });

  it('removing an already-known inherited word via overrides.remove breaks monotonicity', () => {
    const files = loadVocabChain();
    files['grade-7']!.overrides = { add: [], remove: ['free time'] };
    const filePaths = { 'grade-5': 'vocab-grade-5.yaml', 'grade-6': 'vocab-grade-6.yaml', 'grade-7': 'vocab-grade-7.yaml' };
    const issues = validateVocabChain(files, filePaths);
    const err = issues.find((i) => i.code === 'vocab_monotonicity_broken');
    expect(err).toBeDefined();
    expect(err!.id).toBe('free time');
    expect(err!.file).toBe('vocab-grade-7.yaml');
  });

  it('is case/whitespace-insensitive when comparing words across the chain', () => {
    const files = loadVocabChain();
    files['grade-6']!.modules.m1!.push('  Hobby  ');
    const filePaths = { 'grade-5': 'vocab-grade-5.yaml', 'grade-6': 'vocab-grade-6.yaml', 'grade-7': 'vocab-grade-7.yaml' };
    const issues = validateVocabChain(files, filePaths);
    expect(issues.some((i) => i.code === 'vocab_reintroduction' && i.id === 'hobby')).toBe(true);
  });
});
