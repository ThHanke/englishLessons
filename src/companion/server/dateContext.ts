import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadYaml } from "../../schema/yaml.ts";
import type {
  ModulesFile,
  ClassFile,
  LessonSpec,
} from "../../schema/types.ts";
import type { Phase } from "../../projection/types.ts";
import {
  enumerateProjectionSlots,
  isoWeekday,
  weightSlots,
} from "../../projection/slots.ts";
import { deriveHalfYearBoundary, dateHalfYear } from "../../projection/halfYear.ts";
import { fillModules } from "../../projection/fillModules.ts";
import { whichModule } from "../../projection/query.ts";
import { gapReport } from "../../coverage/gapReport.ts";
import { driftReport } from "../../coverage/driftReport.ts";
import type { CalendarDrift, Gap } from "../../coverage/types.ts";
import { buildLedger, lastTaughtDate } from "./buildLedger.ts";
import { artifactDir } from "./artifactPath.ts";
import { loadCalendarForClass } from "./loadCalendar.ts";
import { readAppointmentMaterials } from "./moduleTasks.ts";

const DEFAULT_REPO_ROOT = new URL("../../../", import.meta.url).pathname;

export interface TeachingDayContext {
  isTeachingDay: true;
  className: string;
  date: string;
  moduleId: string;
  moduleTitle: string;
  moduleGoals: string[];
  weekInModule: number;
  phase: Phase;
  gaps: Gap[];
  /** Repo-relative path to `lesson-spec.json` when one exists for this date, else null. */
  lessonSpecPath: string | null;
  /** Parsed `lesson-spec.json` contents when one exists for this date, else null. */
  lessonSpec: LessonSpec | null;
  /** From that date's `manifest.json`, same shape/source as `Appointment.materials`
   * (`moduleTasks.ts`) -- empty when no manifest exists yet. Lets the chat's context-preview
   * panel link out to the lesson-plan/homework/test pages instead of only describing the spec
   * in text. */
  materials: Array<{ file: string; type: string; title: string }>;
  /** The `LessonSlot.id` this context resolved to, when the class has `lesson_slots` configured
   * -- undefined for classes that can't have more than one lesson per day. */
  slotId?: string;
  /** How far this class's actual delivered pace (`lastTaughtDate`) trails its planned position
   * as of `date` -- lets the agent compensate (skip a practice slot, fold in remedial coverage)
   * instead of planning to the nominal calendar position when the class has fallen behind. */
  calendarDrift: CalendarDrift;
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
  const plansDir = join(repoRoot, "plans");
  for (const gradeDir of readdirSync(plansDir)) {
    const dirPath = join(plansDir, gradeDir);
    if (!statSync(dirPath).isDirectory()) continue;
    const classPath = join(dirPath, "class.yaml");
    if (!existsSync(classPath)) continue;
    const classFile = loadYaml<ClassFile>(classPath);
    if (classFile.name === className) {
      const modulesFile = loadYaml<ModulesFile>(join(dirPath, "modules.yaml"));
      return { modulesFile, classFile };
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
export function dateContext(params: {
  className: string;
  date: string;
  slotId?: string;
  repoRoot?: string;
}): DateContext {
  const { className, date } = params;
  const repoRoot = params.repoRoot ?? DEFAULT_REPO_ROOT;

  const classData = loadClassData(className, repoRoot);
  if (!classData) {
    throw new Error(
      `No class found named "${className}" under plans/*/class.yaml`,
    );
  }
  const { modulesFile } = classData;

  const calendar = loadCalendarForClass(className, repoRoot);
  if (!calendar) {
    throw new Error(
      `No calendar file under calendar/*.yaml has a class_schedule entry for "${className}"`,
    );
  }

  // A double-period day (two `lesson_slots` matching this date's weekday+half-year) is
  // ambiguous without an explicit `slotId` -- fail loud rather than silently picking one and
  // colliding with the other lesson's content. A single match auto-resolves (today's common
  // case, and every existing caller that doesn't pass `slotId` yet keeps working unchanged).
  let slotId = params.slotId;
  const classLessonSlots = calendar.class_schedule[className]?.lesson_slots ?? [];
  if (classLessonSlots.length > 0) {
    const weekday = isoWeekday(date);
    let halfYear: 1 | 2 | null = null;
    try {
      halfYear = dateHalfYear(date, deriveHalfYearBoundary(calendar));
    } catch {
      halfYear = null;
    }
    const matching = classLessonSlots.filter(
      (ls) => ls.day === weekday && (halfYear === null || ls.half_year === halfYear),
    );
    if (matching.length > 1 && !slotId) {
      throw new Error(
        `Multiple lesson slots match ${className} on ${date} (${matching
          .map((s) => s.id)
          .join(", ")}) -- specify slotId.`,
      );
    }
    if (matching.length > 0 && !slotId) {
      slotId = matching[0]!.id;
    }
  }

  const weeklyLessons = modulesFile.weekly_lessons;
  if (weeklyLessons === "DRAFT") {
    return {
      isTeachingDay: false,
      className,
      date,
      reason: "Curriculum not finalized (DRAFT weekly_lessons)",
    };
  }
  const rawSlots = enumerateProjectionSlots(calendar, weeklyLessons);
  const weighted = weightSlots(rawSlots, calendar);
  const placements = fillModules(weighted, modulesFile);
  const which = whichModule(placements, date);

  if (which.moduleId === null) {
    return { isTeachingDay: false, className, date, reason: which.reason };
  }

  const ledger = buildLedger(className, modulesFile, repoRoot);
  const report = gapReport({ asOfDate: date, ledger, modulesFile, placements });
  const moduleGaps = report.gaps.filter((g) => g.moduleId === which.moduleId);
  const drift = driftReport({
    asOfDate: date,
    placements,
    ledger,
    modulesFile,
    actualLastTaughtDate: lastTaughtDate(className, repoRoot),
  });

  const specAbsPath = join(artifactDir(repoRoot, className, date, slotId), "lesson-spec.json");
  const specRelPath = join(
    "artifacts",
    className,
    date,
    ...(slotId ? [slotId] : []),
    "lesson-spec.json",
  );
  let lessonSpec: LessonSpec | null = null;
  let lessonSpecPath: string | null = null;
  if (existsSync(specAbsPath)) {
    lessonSpec = JSON.parse(readFileSync(specAbsPath, "utf-8")) as LessonSpec;
    lessonSpecPath = specRelPath;
  }

  const mod = modulesFile.modules.find((m) => m.id === which.moduleId);

  return {
    isTeachingDay: true,
    className,
    date,
    moduleId: which.moduleId,
    moduleTitle: mod?.title ?? which.moduleId,
    moduleGoals: mod?.goals ?? [],
    weekInModule: which.weekInModule!,
    phase: which.phase!,
    gaps: moduleGaps,
    lessonSpecPath,
    lessonSpec,
    materials: readAppointmentMaterials(className, date, repoRoot, slotId),
    calendarDrift: drift.calendarDrift,
    ...(slotId ? { slotId } : {}),
  };
}
