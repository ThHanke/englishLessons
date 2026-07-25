import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadYaml } from '../../schema/yaml.ts';
import type { ModulesFile, ClassFile, CalendarFile, LessonSpec } from '../../schema/types.ts';
import type { Phase } from '../../projection/types.ts';
import { enumerateSlots, weightSlots } from '../../projection/slots.ts';
import { fillModules } from '../../projection/fillModules.ts';
import { whichModule } from '../../projection/query.ts';
import { gapReport } from '../../coverage/gapReport.ts';
import type { Gap } from '../../coverage/types.ts';
import { buildLedger } from './buildLedger.ts';

const DEFAULT_REPO_ROOT = new URL('../../../', import.meta.url).pathname;

export interface TeachingDayContext {
  isTeachingDay: true;
  className: string;
  date: string;
  moduleId: string;
  weekInModule: number;
  phase: Phase;
  gaps: Gap[];
  /** Repo-relative path to `lesson-spec.json` when one exists for this date, else null. */
  lessonSpecPath: string | null;
  /** Parsed `lesson-spec.json` contents when one exists for this date, else null. */
  lessonSpec: LessonSpec | null;
}

export interface NonTeachingDayContext {
  isTeachingDay: false;
  className: string;
  date: string;
  /** Why no lesson is scheduled (holiday, weekend, or outside the school year) - from `whichModule`. */
  reason: string;
}

export type DateContext = TeachingDayContext | NonTeachingDayContext;

interface ClassData {
  modulesFile: ModulesFile;
  classFile: ClassFile;
}

/** Mirrors `src/cli/validateAll.ts`'s `plans/<grade-dir>/{modules.yaml,class.yaml}` lookup, scoped to one class by name. */
function loadClassData(className: string, repoRoot: string): ClassData | null {
  const plansDir = join(repoRoot, 'plans');
  for (const gradeDir of readdirSync(plansDir)) {
    const dirPath = join(plansDir, gradeDir);
    if (!statSync(dirPath).isDirectory()) continue;
    const classPath = join(dirPath, 'class.yaml');
    if (!existsSync(classPath)) continue;
    const classFile = loadYaml<ClassFile>(classPath);
    if (classFile.name === className) {
      const modulesFile = loadYaml<ModulesFile>(join(dirPath, 'modules.yaml'));
      return { modulesFile, classFile };
    }
  }
  return null;
}

/**
 * Mirrors `src/cli/validateAll.ts`'s `calendar/*.yaml` walk, then picks the file whose
 * `class_schedule` covers `className`. Fallback when this matches more than one calendar file:
 * first match wins, in `readdirSync` order - no further ambiguity resolution is implemented,
 * since today's repo only ever has one calendar file per school year and this hasn't come up.
 */
function loadCalendarForClass(className: string, repoRoot: string): CalendarFile | null {
  const calendarDir = join(repoRoot, 'calendar');
  const files = readdirSync(calendarDir).filter((f) => f.endsWith('.yaml'));
  for (const file of files) {
    const calendar = loadYaml<CalendarFile>(join(calendarDir, file));
    if (calendar.class_schedule[className]) {
      return calendar;
    }
  }
  return null;
}

/**
 * Given a class + date, assembles the seed context for a new or resumed chat session:
 * `whichModule`'s placement result, that module's current `gapReport` gaps, and a reference to
 * an existing `lesson-spec.json` for the date when one exists. A holiday/weekend/non-teaching
 * date (`whichModule` returns `moduleId: null`) is returned as a distinctly-typed
 * `NonTeachingDayContext` (`isTeachingDay: false`) rather than a normal context object with a
 * null module id buried in it, so a caller can skip opening a chat session without inspecting a
 * magic null.
 */
export function dateContext(params: { className: string; date: string; repoRoot?: string }): DateContext {
  const { className, date } = params;
  const repoRoot = params.repoRoot ?? DEFAULT_REPO_ROOT;

  const classData = loadClassData(className, repoRoot);
  if (!classData) {
    throw new Error(`No class found named "${className}" under plans/*/class.yaml`);
  }
  const { modulesFile } = classData;

  const calendar = loadCalendarForClass(className, repoRoot);
  if (!calendar) {
    throw new Error(`No calendar file under calendar/*.yaml has a class_schedule entry for "${className}"`);
  }

  const rawSlots = enumerateSlots(calendar, className);
  const weighted = weightSlots(rawSlots, calendar);
  const placements = fillModules(weighted, modulesFile);
  const which = whichModule(placements, date);

  if (which.moduleId === null) {
    return { isTeachingDay: false, className, date, reason: which.reason };
  }

  const ledger = buildLedger(className, modulesFile, repoRoot);
  const report = gapReport({ asOfDate: date, ledger, modulesFile, placements });
  const moduleGaps = report.gaps.filter((g) => g.moduleId === which.moduleId);

  const specRelPath = join('artifacts', className, date, 'lesson-spec.json');
  const specAbsPath = join(repoRoot, specRelPath);
  let lessonSpec: LessonSpec | null = null;
  let lessonSpecPath: string | null = null;
  if (existsSync(specAbsPath)) {
    lessonSpec = JSON.parse(readFileSync(specAbsPath, 'utf-8')) as LessonSpec;
    lessonSpecPath = specRelPath;
  }

  return {
    isTeachingDay: true,
    className,
    date,
    moduleId: which.moduleId,
    weekInModule: which.weekInModule!,
    phase: which.phase!,
    gaps: moduleGaps,
    lessonSpecPath,
    lessonSpec,
  };
}
