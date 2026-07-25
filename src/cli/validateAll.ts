import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadYaml } from '../schema/yaml.ts';
import type { GradeBand, ModulesFile, ClassFile, VocabularyFile, CalendarFile } from '../schema/types.ts';
import { validateGradeBand, type Issue } from '../validate/curriculumValidator.ts';
import {
  validateModulesReferential,
  checkCoverageLintAcrossModules,
  validateVocabReference,
  validateVocabChain,
} from '../validate/referentialValidator.ts';
import { validateCalendar } from '../validate/calendarValidator.ts';

const REPO_ROOT = new URL('../../', import.meta.url).pathname;

/**
 * Bands whose full grade span has a modules.yaml file in Phase 0, so the aggregate
 * produce-coverage lint can run across them. 7-8-realschule only has a grade-7 file so far
 * (grade-8 is additive later, Scope Boundaries) - running the aggregate check against a
 * single-grade slice of that band would falsely flag its deliberately-deferred grammar items
 * as uncovered. See docs/module-derivation-notes.md.
 */
const AGGREGATE_COVERAGE_BANDS = new Set(['sa-sek-en-2019.5-6']);

function walkYamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkYamlFiles(full));
    } else if (entry.endsWith('.yaml') && !entry.endsWith('.draft.yaml')) {
      out.push(full);
    }
  }
  return out;
}

function relPath(p: string): string {
  return p.startsWith(REPO_ROOT) ? p.slice(REPO_ROOT.length) : p;
}

function loadBands(): { bandsById: Map<string, GradeBand>; issues: Issue[] } {
  const bandsById = new Map<string, GradeBand>();
  const issues: Issue[] = [];
  const curriculumDir = join(REPO_ROOT, 'curriculum');
  for (const file of walkYamlFiles(curriculumDir)) {
    if (!file.includes('grade-bands')) continue;
    const band = loadYaml<GradeBand>(file);
    issues.push(...validateGradeBand(band, relPath(file)));
    bandsById.set(band.id, band);
  }
  return { bandsById, issues };
}

interface LoadedModules {
  grade: string;
  filePath: string;
  modulesFile: ModulesFile;
  classFile: ClassFile;
}

function loadModulesFiles(): LoadedModules[] {
  const plansDir = join(REPO_ROOT, 'plans');
  const loaded: LoadedModules[] = [];
  for (const gradeDir of readdirSync(plansDir)) {
    const dirPath = join(plansDir, gradeDir);
    if (!statSync(dirPath).isDirectory()) continue;
    const modulesPath = join(dirPath, 'modules.yaml');
    const classPath = join(dirPath, 'class.yaml');
    loaded.push({
      grade: gradeDir,
      filePath: modulesPath,
      modulesFile: loadYaml<ModulesFile>(modulesPath),
      classFile: loadYaml<ClassFile>(classPath),
    });
  }
  return loaded.sort((a, b) => a.classFile.grade - b.classFile.grade);
}

function loadCalendarFiles(): { files: CalendarFile[]; paths: string[] } {
  const calendarDir = join(REPO_ROOT, 'calendar');
  const files: CalendarFile[] = [];
  const paths: string[] = [];
  for (const file of walkYamlFiles(calendarDir)) {
    files.push(loadYaml<CalendarFile>(file));
    paths.push(relPath(file));
  }
  return { files, paths };
}

function loadVocabFiles(): { files: Record<string, VocabularyFile>; paths: Record<string, string> } {
  const vocabDir = join(REPO_ROOT, 'vocabulary');
  const files: Record<string, VocabularyFile> = {};
  const paths: Record<string, string> = {};
  for (const file of walkYamlFiles(vocabDir)) {
    const grade = file.replace(/\.yaml$/, '').split('/').pop()!;
    files[grade] = loadYaml<VocabularyFile>(file);
    paths[grade] = relPath(file);
  }
  return { files, paths };
}

function run(): number {
  const allIssues: Issue[] = [];

  const { bandsById, issues: bandIssues } = loadBands();
  allIssues.push(...bandIssues);

  const modulesFiles = loadModulesFiles();
  const knownCurriculumIds = new Set(bandsById.keys());

  for (const { filePath, modulesFile } of modulesFiles) {
    const band = bandsById.get(modulesFile.curriculum);
    if (!band) {
      allIssues.push({
        severity: 'error',
        code: 'unknown_curriculum',
        message: `modules.yaml references unknown curriculum "${modulesFile.curriculum}"`,
        file: relPath(filePath),
      });
      continue;
    }
    allIssues.push(
      ...validateModulesReferential({ modulesFile, modulesFilePath: relPath(filePath), band }),
    );
  }

  const byCurriculum = new Map<string, LoadedModules[]>();
  for (const entry of modulesFiles) {
    const list = byCurriculum.get(entry.modulesFile.curriculum) ?? [];
    list.push(entry);
    byCurriculum.set(entry.modulesFile.curriculum, list);
  }
  for (const [curriculumId, entries] of byCurriculum) {
    const band = bandsById.get(curriculumId);
    if (!band) continue;
    if (!AGGREGATE_COVERAGE_BANDS.has(curriculumId)) {
      allIssues.push({
        severity: 'deferred',
        code: 'aggregate_coverage_deferred',
        message: `Aggregate produce-coverage lint skipped for "${curriculumId}" - band's full grade span not yet built in Phase 0 (see docs/module-derivation-notes.md)`,
        file: entries.map((e) => relPath(e.filePath)).join(', '),
      });
      continue;
    }
    const ordered = entries.flatMap(({ modulesFile, filePath }) =>
      modulesFile.modules.map((module) => ({ module, filePath: relPath(filePath) })),
    );
    allIssues.push(...checkCoverageLintAcrossModules(ordered, band));
  }

  const knownClassNames = new Set(modulesFiles.map((m) => m.classFile.name));
  const { files: calendarFiles, paths: calendarPaths } = loadCalendarFiles();
  calendarFiles.forEach((calendar, i) => {
    allIssues.push(...validateCalendar(calendar, calendarPaths[i]!, knownClassNames));
  });

  const { files: vocabFiles, paths: vocabPaths } = loadVocabFiles();
  for (const [grade, vocab] of Object.entries(vocabFiles)) {
    allIssues.push(
      ...validateVocabReference({ vocab, vocabFilePath: vocabPaths[grade]!, knownCurriculumIds }),
    );
  }
  allIssues.push(...validateVocabChain(vocabFiles, vocabPaths));

  const errors = allIssues.filter((i) => i.severity === 'error');
  const deferred = allIssues.filter((i) => i.severity === 'deferred');

  for (const issue of deferred) {
    console.log(`DEFERRED [${issue.code}] ${issue.file}: ${issue.message}`);
  }
  for (const issue of errors) {
    console.error(`ERROR [${issue.code}] ${issue.file}${issue.id ? ` (${issue.id})` : ''}: ${issue.message}`);
  }

  console.log(
    `\n${errors.length} error(s), ${deferred.length} deferred, ${bandsById.size} band(s), ${modulesFiles.length} modules file(s), ${calendarFiles.length} calendar file(s), ${Object.keys(vocabFiles).length} vocab file(s) checked.`,
  );

  return errors.length === 0 ? 0 : 1;
}

process.exitCode = run();
