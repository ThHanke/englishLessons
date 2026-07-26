import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadYaml } from '../../schema/yaml.ts';
import type { ModulesFile, ClassFile, CalendarFile } from '../../schema/types.ts';
import { enumerateSlots, weightSlots } from '../../projection/slots.ts';
import { fillModules } from '../../projection/fillModules.ts';
import { gapReport } from '../../coverage/gapReport.ts';
import type { Gap } from '../../coverage/types.ts';
import { buildLedger, listLessonSpecs } from './buildLedger.ts';

const DEFAULT_REPO_ROOT = new URL('../../../', import.meta.url).pathname;

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
}

/** `classFile.name` embeds a school-year-ish suffix (`grade-5-2026`, `grade-7-realschule-2026`)
 * that isn't actually the school year every class is scheduled against — every class currently
 * maps onto the same 2026/2027 calendar, so showing that suffix in the UI reads as a real (and
 * inconsistent) year per grade. The display label uses `classFile.grade`/`track` instead, which
 * is unambiguous; `id` keeps the raw `name` since that's the real join key against `plans/`. */
function classLabel(classFile: ClassFile): string {
  return `Grade ${classFile.grade}${classFile.track ? ` (${classFile.track})` : ''}`;
}

function listAllClasses(repoRoot: string): Array<{ modulesFile: ModulesFile; classFile: ClassFile }> {
  const plansDir = join(repoRoot, 'plans');
  const out: Array<{ modulesFile: ModulesFile; classFile: ClassFile }> = [];
  for (const gradeDir of readdirSync(plansDir)) {
    const dirPath = join(plansDir, gradeDir);
    if (!statSync(dirPath).isDirectory()) continue;
    const classPath = join(dirPath, 'class.yaml');
    const modulesPath = join(dirPath, 'modules.yaml');
    if (!existsSync(classPath) || !existsSync(modulesPath)) continue;
    out.push({ classFile: loadYaml<ClassFile>(classPath), modulesFile: loadYaml<ModulesFile>(modulesPath) });
  }
  return out;
}

function loadCalendarForClass(className: string, repoRoot: string): CalendarFile | null {
  const calendarDir = join(repoRoot, 'calendar');
  for (const file of readdirSync(calendarDir).filter((f) => f.endsWith('.yaml'))) {
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
export function moduleTasks(
  params: { from: string; to: string; repoRoot?: string },
): { classes: ClassSummary[]; tasks: ModuleTask[]; appointments: Appointment[] } {
  const repoRoot = params.repoRoot ?? DEFAULT_REPO_ROOT;
  const classes: ClassSummary[] = [];
  const tasks: ModuleTask[] = [];
  const appointments: Appointment[] = [];

  for (const { modulesFile, classFile } of listAllClasses(repoRoot)) {
    classes.push({ id: classFile.name, label: classLabel(classFile) });

    let placements;
    try {
      const calendar = loadCalendarForClass(classFile.name, repoRoot);
      if (!calendar) continue;
      const weighted = weightSlots(enumerateSlots(calendar, classFile.name), calendar);
      placements = fillModules(weighted, modulesFile);
    } catch {
      // DRAFT time fields (KTD7) or no matching calendar - this class has no computable
      // placements yet; still listed in `classes[]`, just contributes no tasks.
      continue;
    }

    const ledger = buildLedger(classFile.name, modulesFile, repoRoot);
    const today = new Date().toISOString().slice(0, 10);
    const report = gapReport({ asOfDate: today, ledger, modulesFile, placements });
    const specs = listLessonSpecs(classFile.name, repoRoot);
    const moduleTitleById = new Map(modulesFile.modules.map((m) => [m.id, m.title]));

    const plannedDateSet = new Set(specs.map((s) => s.date));

    for (const placement of placements) {
      if (placement.slots.length === 0) continue;
      const dates = placement.slots.map((s) => s.date);
      const startDate = dates.reduce((a, b) => (a < b ? a : b));
      const endDate = dates.reduce((a, b) => (a > b ? a : b));
      const moduleTitle = moduleTitleById.get(placement.moduleId) ?? placement.moduleId;

      // Appointments are filtered per-slot below (not by the task's overall [startDate, endDate]
      // window), so a module that starts before `from` but has slots inside it still surfaces
      // real click targets for those in-range dates.
      for (const slot of placement.slots) {
        if (slot.date < params.from || slot.date > params.to) continue;
        appointments.push({
          classId: classFile.name,
          classLabel: classLabel(classFile),
          moduleId: placement.moduleId,
          moduleTitle,
          date: slot.date,
          hasLessonSpec: plannedDateSet.has(slot.date),
        });
      }

      if (endDate < params.from || startDate > params.to) continue;
      tasks.push({
        classId: classFile.name,
        classLabel: classLabel(classFile),
        moduleId: placement.moduleId,
        moduleTitle,
        startDate,
        endDate,
        gaps: report.gaps.filter((g) => g.moduleId === placement.moduleId),
        plannedDates: specs.filter((s) => s.moduleId === placement.moduleId && s.date >= startDate && s.date <= endDate).map((s) => s.date),
      });
    }
  }

  return { classes, tasks, appointments };
}
