import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadYaml } from "../../schema/yaml.ts";
import type {
  ModulesFile,
  ClassFile,
  CalendarFile,
  LessonSlot,
} from "../../schema/types.ts";
import {
  enumerateProjectionSlots,
  enumerateSlots,
  weightSlots,
} from "../../projection/slots.ts";
import {
  deriveHalfYearBoundary,
  dateHalfYear,
} from "../../projection/halfYear.ts";

const WEEKDAY_ABBR = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

function isoWeekday(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return WEEKDAY_ABBR[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}
import { fillModules } from "../../projection/fillModules.ts";
import { gapReport } from "../../coverage/gapReport.ts";
import type { Gap } from "../../coverage/types.ts";
import { buildLedger, listLessonSpecs } from "./buildLedger.ts";

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
  start?: string;
  end?: string;
  slotId?: string;
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

function loadCalendarForClass(
  className: string,
  repoRoot: string,
): CalendarFile | null {
  const calendarDir = join(repoRoot, "calendar");
  for (const file of readdirSync(calendarDir).filter((f) =>
    f.endsWith(".yaml"),
  )) {
    const calendar = loadYaml<CalendarFile>(join(calendarDir, file));
    if (calendar.class_schedule[className]) return calendar;
  }
  return null;
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
} {
  const repoRoot = params.repoRoot ?? DEFAULT_REPO_ROOT;
  const classes: ClassSummary[] = [];
  const tasks: ModuleTask[] = [];
  const appointments: Appointment[] = [];

  for (const { modulesFile, classFile } of listAllClasses(repoRoot)) {
    classes.push({ id: classFile.name, label: classLabel(classFile) });

    let placements;
    const calendar = loadCalendarForClass(classFile.name, repoRoot);
    if (!calendar) continue;
    try {
      const weeklyLessons = modulesFile.weekly_lessons;
      if (weeklyLessons === "DRAFT") continue;
      const weighted = weightSlots(
        enumerateProjectionSlots(calendar, weeklyLessons),
        calendar,
      );
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
    const specs = listLessonSpecs(classFile.name, repoRoot);
    const moduleTitleById = new Map(
      modulesFile.modules.map((m) => [m.id, m.title]),
    );

    const plannedDateSet = new Set(specs.map((s) => s.date));

    for (const placement of placements) {
      if (placement.slots.length === 0) continue;
      const dates = placement.slots.map((s) => s.date);
      const startDate = dates.reduce((a, b) => (a < b ? a : b));
      const endDate = dates.reduce((a, b) => (a > b ? a : b));
      const moduleTitle =
        moduleTitleById.get(placement.moduleId) ?? placement.moduleId;

      if (endDate < params.from || startDate > params.to) continue;
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
      });
    }

    const classLessonSlots =
      calendar.class_schedule[classFile.name]?.lesson_slots ?? [];
    const hasLessonSlots = classLessonSlots.length > 0;

    if (hasLessonSlots) {
      const scheduledDates = enumerateSlots(calendar, classFile.name);
      let boundary: string | null = null;
      try {
        boundary = deriveHalfYearBoundary(calendar);
      } catch {
        /* no boundary */
      }

      for (const sd of scheduledDates) {
        if (sd.date < params.from || sd.date > params.to) continue;
        const mod = placements.find(
          (p) =>
            p.slots.length > 0 &&
            sd.date >= p.slots[0]!.date &&
            sd.date <= p.slots[p.slots.length - 1]!.date,
        );
        if (!mod) continue;
        const weekday = isoWeekday(sd.date);
        const halfYear = boundary ? dateHalfYear(sd.date, boundary) : null;
        const matchingSlot = classLessonSlots.find(
          (ls: LessonSlot) =>
            ls.day === weekday &&
            (halfYear === null || ls.half_year === halfYear),
        );
        appointments.push({
          classId: classFile.name,
          classLabel: classLabel(classFile),
          moduleId: mod.moduleId,
          moduleTitle:
            moduleTitleById.get(mod.moduleId) ?? mod.moduleId,
          date: sd.date,
          hasLessonSpec: plannedDateSet.has(sd.date),
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

  return { classes, tasks, appointments, lessonSlots };
}
