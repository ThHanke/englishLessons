import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadYaml } from "../../schema/yaml.ts";
import type {
  ModulesFile,
  ClassFile,
  Holiday,
  LessonSlot,
  Milestone,
} from "../../schema/types.ts";
import { enumerateSlots, estimateWeeklySlots, weightSlots } from "../../projection/slots.ts";
import { fillModules } from "../../projection/fillModules.ts";
import { gapReport } from "../../coverage/gapReport.ts";
import { driftReport } from "../../coverage/driftReport.ts";
import type { DriftReport, Gap } from "../../coverage/types.ts";
import { buildLedger, lastTaughtDate, listLessonSpecs } from "./buildLedger.ts";
import { artifactDir } from "./artifactPath.ts";
import { loadCalendarForClass } from "./loadCalendar.ts";
import { loadCurriculumBands, resolveCompetenceLabels } from "../../curriculum/resolveCompetenceLabel.ts";

const DEFAULT_REPO_ROOT = new URL("../../../", import.meta.url).pathname;

export interface ClassSummary {
  id: string;
  label: string;
}

export interface ModuleTask {
  classId: string;
  classLabel: string;
  moduleId: string;
  moduleTitle: string;
  startDate: string;
  endDate: string;
  gaps: Gap[];
  /** Dates within `[startDate, endDate]` that already have a `lesson-spec.json` (R11). */
  plannedDates: string[];
  /** `coverageLedger().modules[].percentAtRequiredDepth` for this module -- already computed by
   * `buildLedger()` today, just never attached to a `ModuleTask` before. 0 when the module has no
   * `covers[]` target or no ledger entry yet. */
  coveragePercent: number;
  /** From `fillModules()`'s placement -- the milestone's actual calendar date (after any
   * forward-shift off a degraded slot), or null when the module has no test/project/presentation
   * milestone or its slots haven't been placed. */
  milestoneDate: string | null;
  milestoneType: Milestone["type"];
  /** Human-readable labels (via `resolveCompetenceLabel`), not the raw competence ids
   * `Milestone.assesses` stores. */
  milestoneAssesses: string[];
  /** True when this task's dates come from `estimateWeeklySlots` (no real `lesson_slots`
   * exist for this class yet) rather than the class's actual schedule -- a coarse
   * week-count preview, not a placement the teacher can plan a lesson against yet. */
  estimated: boolean;
}

/** One real teaching slot for a class+module (from the projection engine's own placement, not a
 * fabricated weekday pattern) — the actual per-date click target (R11): unlike a `ModuleTask`'s
 * whole-module span, an appointment already carries a specific `classId` + `date`, so clicking one
 * can go straight to a lesson preview without the grade+date form. */
export interface Appointment {
  classId: string;
  classLabel: string;
  moduleId: string;
  moduleTitle: string;
  date: string;
  hasLessonSpec: boolean;
  /** This specific lesson's topic (`lesson-spec.json`'s `content_field.text`) once planned --
   * distinct from `moduleTitle`, which is the same for every lesson in the module. Absent when
   * `hasLessonSpec` is false (nothing planned yet to pull a topic from). */
  lessonTopic?: string;
  /** `focus_competences[].topic`, already human-readable. Same absence rule as `lessonTopic`. */
  lessonCompetenceTopics?: string[];
  /** From that date's `manifest.json` (R8) — empty when no manifest exists yet for this date. */
  materials: Array<{ file: string; type: string; title: string }>;
  start?: string;
  end?: string;
  slotId?: string;
}

/** Reads `<artifactDir>/manifest.json` for the appointment-link summary (R8) -- just the fields
 * the calendar link needs, not the full manifest entry shape. Also used by `dateContext.ts` for
 * the chat's context-preview panel, which needs the same hasHomework/hasTest signal. */
export function readAppointmentMaterials(
  className: string,
  date: string,
  repoRoot: string,
  slotId?: string,
): Array<{ file: string; type: string; title: string }> {
  const manifestPath = join(artifactDir(repoRoot, className, date, slotId), "manifest.json");
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    materials: Array<{ file: string; type: string; title: string }>;
  };
  return manifest.materials.map((m) => ({ file: m.file, type: m.type, title: m.title }));
}

/** `classFile.name` embeds a school-year-ish suffix (`grade-5-2026`, `grade-7-realschule-2026`)
 * that isn't actually the school year every class is scheduled against — every class currently
 * maps onto the same 2026/2027 calendar, so showing that suffix in the UI reads as a real (and
 * inconsistent) year per grade. The display label uses `classFile.grade`/`track` instead, which
 * is unambiguous; `id` keeps the raw `name` since that's the real join key against `plans/`. */
function classLabel(classFile: ClassFile): string {
  return `Grade ${classFile.grade}${classFile.track ? ` (${classFile.track})` : ""}`;
}

function listAllClasses(
  repoRoot: string,
): Array<{ modulesFile: ModulesFile; classFile: ClassFile }> {
  const plansDir = join(repoRoot, "plans");
  const out: Array<{ modulesFile: ModulesFile; classFile: ClassFile }> = [];
  for (const gradeDir of readdirSync(plansDir)) {
    const dirPath = join(plansDir, gradeDir);
    if (!statSync(dirPath).isDirectory()) continue;
    const classPath = join(dirPath, "class.yaml");
    const modulesPath = join(dirPath, "modules.yaml");
    if (!existsSync(classPath) || !existsSync(modulesPath)) continue;
    out.push({
      classFile: loadYaml<ClassFile>(classPath),
      modulesFile: loadYaml<ModulesFile>(modulesPath),
    });
  }
  return out;
}

/**
 * One `ModuleTask` per module placement whose date range overlaps `[from, to]`, across every
 * class under `plans/*`\/class.yaml — the multi-grade overlay's data source (R11). A class whose
 * `modules.yaml` still has DRAFT time fields (KTD7 — grades 5/6 as of this writing) can't have its
 * placements computed yet; it still appears in `classes[]` (so the panel/legend lists all grades)
 * but contributes zero tasks, rather than failing the whole response for every other class.
 */
export function moduleTasks(params: {
  from: string;
  to: string;
  repoRoot?: string;
}): {
  classes: ClassSummary[];
  tasks: ModuleTask[];
  appointments: Appointment[];
  lessonSlots: Record<string, LessonSlot[]>;
  /** Calendar/coverage drift as of today, per class -- absent for a class whose placements
   * couldn't be computed (DRAFT `weekly_lessons`, no matching calendar). */
  drift: Record<string, DriftReport>;
  /** Union of every distinct calendar file's `holidays[]` encountered across all classes,
   * deduped by `name+from+to` (several classes commonly share one school-year calendar file) --
   * the interactive calendar widget's holidays toggle-layer data source (R-holidays). */
  holidays: Holiday[];
} {
  const repoRoot = params.repoRoot ?? DEFAULT_REPO_ROOT;
  const classes: ClassSummary[] = [];
  const tasks: ModuleTask[] = [];
  const appointments: Appointment[] = [];
  const drift: Record<string, DriftReport> = {};
  const holidaysByKey = new Map<string, Holiday>();
  // Loaded once, shared across every class -- the curriculum grade-bands don't vary per class.
  const curriculumBands = loadCurriculumBands(repoRoot);

  for (const { modulesFile, classFile } of listAllClasses(repoRoot)) {
    classes.push({ id: classFile.name, label: classLabel(classFile) });

    let placements;
    const calendar = loadCalendarForClass(classFile.name, repoRoot);
    if (!calendar) continue;
    for (const holiday of calendar.holidays) {
      holidaysByKey.set(`${holiday.name}::${holiday.from}::${holiday.to}`, holiday);
    }
    const classLessonSlots =
      calendar.class_schedule[classFile.name]?.lesson_slots ?? [];
    const hasLessonSlots = classLessonSlots.length > 0;
    try {
      if (modulesFile.weekly_lessons === "DRAFT") continue;
      // Real schedule once lesson_slots exist (exact dates); until then, a coarse
      // week-count estimate just to give the teacher an early module-bar preview -- see
      // estimateWeeklySlots' doc comment for why this never feeds dateContext.ts/appointments.
      const rawSlots = hasLessonSlots
        ? enumerateSlots(calendar, classFile.name)
        : estimateWeeklySlots(calendar, modulesFile.weekly_lessons);
      const weighted = weightSlots(rawSlots, calendar);
      placements = fillModules(weighted, modulesFile);
    } catch {
      // DRAFT time fields (KTD7) or no matching calendar - this class has no computable
      // placements yet; still listed in `classes[]`, just contributes no tasks.
      continue;
    }

    const ledger = buildLedger(classFile.name, modulesFile, repoRoot);
    const today = new Date().toISOString().slice(0, 10);
    const report = gapReport({
      asOfDate: today,
      ledger,
      modulesFile,
      placements,
    });
    drift[classFile.name] = driftReport({
      asOfDate: today,
      placements,
      ledger,
      modulesFile,
      actualLastTaughtDate: lastTaughtDate(classFile.name, repoRoot),
    });
    const specs = listLessonSpecs(classFile.name, repoRoot);
    const moduleTitleById = new Map(
      modulesFile.modules.map((m) => [m.id, m.title]),
    );
    const moduleById = new Map(modulesFile.modules.map((m) => [m.id, m]));
    const coverageByModuleId = new Map(
      ledger.modules.map((m) => [m.moduleId, m.percentAtRequiredDepth]),
    );

    const specByDateSlot = new Map(
      specs.map((s) => [`${s.date}::${s.slotId ?? ""}`, s]),
    );

    for (const placement of placements) {
      if (placement.slots.length === 0) continue;
      const dates = placement.slots.map((s) => s.date);
      const startDate = dates.reduce((a, b) => (a < b ? a : b));
      const endDate = dates.reduce((a, b) => (a > b ? a : b));
      const moduleTitle =
        moduleTitleById.get(placement.moduleId) ?? placement.moduleId;

      if (endDate < params.from || startDate > params.to) continue;
      const milestone = moduleById.get(placement.moduleId)?.milestone;
      tasks.push({
        classId: classFile.name,
        classLabel: classLabel(classFile),
        moduleId: placement.moduleId,
        moduleTitle,
        startDate,
        endDate,
        gaps: report.gaps.filter((g) => g.moduleId === placement.moduleId),
        plannedDates: specs
          .filter(
            (s) =>
              s.moduleId === placement.moduleId &&
              s.date >= startDate &&
              s.date <= endDate,
          )
          .map((s) => s.date),
        coveragePercent: coverageByModuleId.get(placement.moduleId) ?? 0,
        milestoneDate: placement.milestoneDate,
        milestoneType: milestone?.type ?? "none",
        milestoneAssesses: milestone
          ? resolveCompetenceLabels(milestone.assesses, modulesFile.curriculum, curriculumBands)
          : [],
        estimated: !hasLessonSlots,
      });
    }

    if (hasLessonSlots) {
      const scheduledDates = enumerateSlots(calendar, classFile.name);

      for (const sd of scheduledDates) {
        if (sd.date < params.from || sd.date > params.to) continue;
        const mod = placements.find(
          (p) =>
            p.slots.length > 0 &&
            sd.date >= p.slots[0]!.date &&
            sd.date <= p.slots[p.slots.length - 1]!.date,
        );
        if (!mod) continue;
        const matchingSlot = classLessonSlots.find(
          (ls: LessonSlot) => ls.id === sd.slotId,
        );
        const matchingSpec = specByDateSlot.get(`${sd.date}::${matchingSlot?.id ?? ""}`);
        appointments.push({
          classId: classFile.name,
          classLabel: classLabel(classFile),
          moduleId: mod.moduleId,
          moduleTitle:
            moduleTitleById.get(mod.moduleId) ?? mod.moduleId,
          date: sd.date,
          hasLessonSpec: matchingSpec !== undefined,
          lessonTopic: matchingSpec?.topic,
          lessonCompetenceTopics: matchingSpec?.competenceTopics,
          materials: readAppointmentMaterials(
            classFile.name,
            sd.date,
            repoRoot,
            matchingSlot?.id,
          ),
          start: matchingSlot?.start,
          end: matchingSlot?.end,
          slotId: matchingSlot?.id,
        });
      }
    }
  }

  const lessonSlots: Record<string, LessonSlot[]> = {};
  for (const { classFile } of listAllClasses(repoRoot)) {
    const calendar = loadCalendarForClass(classFile.name, repoRoot);
    if (!calendar) continue;
    const entry = calendar.class_schedule[classFile.name];
    if (entry?.lesson_slots && entry.lesson_slots.length > 0) {
      lessonSlots[classFile.name] = entry.lesson_slots;
    }
  }

  return {
    classes,
    tasks,
    appointments,
    lessonSlots,
    drift,
    holidays: [...holidaysByKey.values()],
  };
}
