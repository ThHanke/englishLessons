import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { loadYaml } from "../schema/yaml.ts";
import type { CalendarFile, ClassFile, LessonSpec } from "../schema/types.ts";
import { walkLessonSpecFiles } from "../companion/server/buildLedger.ts";
import { moduleTasks } from "../companion/server/moduleTasks.ts";
import { loadCalendarForClass } from "../companion/server/loadCalendar.ts";
import { renderLessonPage, type LessonPlan, type Manifest } from "./renderLessonPage.ts";
import { renderInlineLessonPage, filterMaterialsForVariant } from "./renderInlineLessonPage.ts";
import { generateClassIcs, schoolYearSlug } from "./generateIcs.ts";
import { findNextLessonDate } from "../projection/nextLessonDate.ts";

const DEFAULT_REPO_ROOT = new URL("../../", import.meta.url).pathname;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Manifest order (creation order) instead of alphabetical filename order -- see the identical
 * helper in companion/server/routes/artifacts.ts, duplicated here since this is a separate
 * (build-time, not server-route) module. */
function orderedMaterialFiles(materialsDir: string, manifest: Manifest | null): string[] {
  const onDisk = new Set(readdirSync(materialsDir).filter((f) => f.endsWith(".html")));
  const ordered: string[] = [];
  const seen = new Set<string>();
  if (manifest) {
    for (const entry of manifest.materials) {
      const bn = basename(entry.file);
      if (onDisk.has(bn) && !seen.has(bn)) {
        ordered.push(bn);
        seen.add(bn);
      }
    }
  }
  for (const f of [...onDisk].sort()) {
    if (!seen.has(f)) ordered.push(f);
  }
  return ordered;
}

/** Mirrors dateContext.ts's loadClassData pattern: scans the plans directory for the known class list. */
function listClassNames(repoRoot: string): string[] {
  const plansDir = join(repoRoot, "plans");
  if (!existsSync(plansDir)) return [];
  const names: string[] = [];
  for (const gradeDir of readdirSync(plansDir)) {
    const dirPath = join(plansDir, gradeDir);
    if (!statSync(dirPath).isDirectory()) continue;
    const classPath = join(dirPath, "class.yaml");
    if (!existsSync(classPath)) continue;
    const classFile = loadYaml<ClassFile>(classPath);
    names.push(classFile.name);
  }
  return names;
}

interface LessonEntry {
  date: string;
  /** Set when this lesson-spec lives under a slot subdirectory (double-period classes) --
   * `artifactDir()`'s `artifacts/<class>/<date>/<slotId>/` shape, mirrored here. */
  slotId?: string;
  specPath: string;
}

/** Reuses buildLedger.ts's recursive lesson-spec.json walk, then derives each date (and slotId,
 * when present) from the path shape. A slot-scoped spec's immediate parent directory name is the
 * slotId, not a date -- checking the parent against `DATE_RE` first distinguishes the two shapes,
 * since a slotId is never itself a `YYYY-MM-DD`-formatted string (artifactPath.ts's `SLOT_ID_RE`
 * only allows `[A-Za-z0-9_-]+`, which a date also technically matches, but real slot ids are
 * UUIDs or short fixture strings, never coincidentally date-shaped). */
function findLessonEntries(className: string, repoRoot: string): LessonEntry[] {
  const classDir = join(repoRoot, "artifacts", className);
  if (!existsSync(classDir)) return [];
  return walkLessonSpecFiles(classDir)
    .map((specPath) => {
      const parentDir = dirname(specPath);
      const parentName = basename(parentDir);
      if (DATE_RE.test(parentName)) {
        return { date: parentName, specPath };
      }
      return { date: basename(dirname(parentDir)), slotId: parentName, specPath };
    })
    .sort(
      (a, b) => a.date.localeCompare(b.date) || (a.slotId ?? "").localeCompare(b.slotId ?? ""),
    );
}

function renderClassIndex(className: string, entries: LessonEntry[]): string {
  const items = entries
    .map((e) => {
      const path = e.slotId ? `${e.date}/${e.slotId}/` : `${e.date}/`;
      const label = e.slotId ? `${e.date} (${e.slotId})` : e.date;
      return `<li><a href="${escapeHtml(path)}">${escapeHtml(label)}</a></li>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(className)}</title></head>
<body>
<h1>${escapeHtml(className)}</h1>
<ul>
${items}
</ul>
</body>
</html>
`;
}

function renderRootIndex(classNames: string[]): string {
  const items = classNames
    .map((c) => `<li><a href="classes/${escapeHtml(c)}/">${escapeHtml(c)}</a></li>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Lessons</title></head>
<body>
<h1>Lessons</h1>
<ul>
${items}
</ul>
</body>
</html>
`;
}

interface CalendarListing {
  classId: string;
  classLabel: string;
  schoolYear: string;
  icsPath: string;
}

function renderCalendarsIndex(listings: CalendarListing[]): string {
  const items = listings
    .map(
      (c) =>
        `<li>${escapeHtml(c.classLabel)} (${escapeHtml(c.schoolYear)}): <a href="${escapeHtml(c.icsPath)}">${escapeHtml(c.icsPath)}</a></li>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Calendars</title></head>
<body>
<h1>Calendars</h1>
<p>Subscribe to a class's schedule in your own calendar app by copying its .ics link below.</p>
<ul>
${items}
</ul>
</body>
</html>
`;
}

/** min(first_school_day)/max(last_school_day) across every `calendar/*.yaml` found -- the static
 * build has no live re-fetch per month like the dev server does, so it covers the full span every
 * school-year calendar file defines, in one `moduleTasks()` call. Returns null when no calendar
 * files exist (a repo with no `calendar/` directory yet), so the caller can skip this section
 * rather than calling `moduleTasks()` with a nonsensical range. */
function fullCalendarSpan(repoRoot: string): { from: string; to: string } | null {
  const calendarDir = join(repoRoot, "calendar");
  if (!existsSync(calendarDir)) return null;
  const files = readdirSync(calendarDir).filter((f) => f.endsWith(".yaml"));
  let from: string | null = null;
  let to: string | null = null;
  for (const file of files) {
    const calendar = loadYaml<CalendarFile>(join(calendarDir, file));
    if (from === null || calendar.first_school_day < from) from = calendar.first_school_day;
    if (to === null || calendar.last_school_day > to) to = calendar.last_school_day;
  }
  if (from === null || to === null) return null;
  return { from, to };
}

/**
 * Walks the plans directory for the known class list, then artifacts/<class>/**\/lesson-spec.json
 * for every date already planned, and writes a full static site/ tree (§4.7 URL scheme) to
 * `outDir`. Full regeneration each run (outDir is wiped first) so re-running is idempotent - no
 * incremental append/merge logic. Classes with zero lesson-spec.json on disk are omitted from
 * the listings entirely (nothing to link to yet), and a repo with no artifacts/ directory at
 * all still produces a valid site/ with a root index listing zero classes, not a throw.
 *
 * Beyond the original per-date linked-materials page (`index.html`, unchanged), this also emits:
 * a three-way artifact page split per date (`lesson-plan/`, `homework/` when homework exists,
 * `test/` when a test exists) with materials embedded inline via `renderInlineLessonPage`; a
 * combined `data/calendar-data.json` (the static Calendar bundle's data source, in place of the
 * dev server's `/api/tasks`); and per-class-per-schoolyear `.ics` exports under `calendars/`,
 * with a `calendars/index.html` listing every one so a user can copy a subscription URL.
 */
export function buildSite(params: { repoRoot: string; outDir: string }): void {
  const { repoRoot, outDir } = params;

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const publishedClasses: string[] = [];

  for (const className of listClassNames(repoRoot)) {
    const entries = findLessonEntries(className, repoRoot);
    if (entries.length === 0) continue;

    const classDir = join(outDir, "classes", className);
    mkdirSync(classDir, { recursive: true });

    // Homework due dates need the calendar, but a repo can have lesson-spec artifacts without a
    // calendar/ directory yet (e.g. tests, early authoring) -- loadCalendarForClass's
    // readdirSync would throw ENOENT in that case, so guard it the same way
    // fullCalendarSpan()'s null return already guards the ICS section below.
    const calendar = existsSync(join(repoRoot, "calendar"))
      ? loadCalendarForClass(className, repoRoot)
      : null;

    for (const entry of entries) {
      const lessonDir = join(classDir, entry.date, ...(entry.slotId ? [entry.slotId] : []));
      mkdirSync(lessonDir, { recursive: true });

      const specDir = dirname(entry.specPath);
      const spec = JSON.parse(readFileSync(entry.specPath, "utf-8")) as LessonSpec;

      const manifestPath = join(specDir, "manifest.json");
      const manifest: Manifest | null = existsSync(manifestPath)
        ? (JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest)
        : null;

      const planPath = join(specDir, "lesson-plan.json");
      const plan: LessonPlan | null = existsSync(planPath)
        ? (JSON.parse(readFileSync(planPath, "utf-8")) as LessonPlan)
        : null;

      const materialsSrcDir = join(specDir, "materials");
      const materialFiles = existsSync(materialsSrcDir)
        ? orderedMaterialFiles(materialsSrcDir, manifest)
        : [];

      if (materialFiles.length > 0) {
        const materialsDestDir = join(lessonDir, "materials");
        mkdirSync(materialsDestDir, { recursive: true });
        for (const file of materialFiles) {
          copyFileSync(join(materialsSrcDir, file), join(materialsDestDir, file));
        }
      }

      writeFileSync(
        join(lessonDir, "index.html"),
        renderLessonPage({ spec, manifest, plan, materialFiles }),
      );

      const materialsWithHtml = materialFiles.map((file) => ({
        file,
        html: readFileSync(join(materialsSrcDir, file), "utf-8"),
      }));

      const lessonPlanMaterials = filterMaterialsForVariant(materialsWithHtml, manifest, "lesson-plan");
      const lessonPlanDir = join(lessonDir, "lesson-plan");
      mkdirSync(lessonPlanDir, { recursive: true });
      writeFileSync(
        join(lessonPlanDir, "index.html"),
        renderInlineLessonPage({
          spec,
          manifest,
          plan,
          materials: lessonPlanMaterials,
          variant: "lesson-plan",
        }),
      );

      const homeworkMaterials = filterMaterialsForVariant(materialsWithHtml, manifest, "homework");
      if (homeworkMaterials.length > 0) {
        const homeworkDir = join(lessonDir, "homework");
        mkdirSync(homeworkDir, { recursive: true });
        const dueDate = calendar ? findNextLessonDate(calendar, className, entry.date) : undefined;
        writeFileSync(
          join(homeworkDir, "index.html"),
          renderInlineLessonPage({
            spec,
            manifest,
            plan: null,
            materials: homeworkMaterials,
            variant: "homework",
            dueDate,
          }),
        );
      }

      const testMaterials = filterMaterialsForVariant(materialsWithHtml, manifest, "test");
      if (testMaterials.length > 0) {
        const testDir = join(lessonDir, "test");
        mkdirSync(testDir, { recursive: true });
        writeFileSync(
          join(testDir, "index.html"),
          renderInlineLessonPage({
            spec,
            manifest,
            plan: null,
            materials: testMaterials,
            variant: "test",
          }),
        );
      }
    }

    writeFileSync(join(classDir, "index.html"), renderClassIndex(className, entries));
    publishedClasses.push(className);
  }

  writeFileSync(join(outDir, "index.html"), renderRootIndex(publishedClasses));

  const span = fullCalendarSpan(repoRoot);
  if (span) {
    const data = moduleTasks({ from: span.from, to: span.to, repoRoot });
    const dataDir = join(outDir, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "calendar-data.json"), JSON.stringify(data, null, 2));

    const calendarsDir = join(outDir, "calendars");
    const listings: CalendarListing[] = [];
    for (const cls of data.classes) {
      const calendar = loadCalendarForClass(cls.id, repoRoot);
      if (!calendar) continue;
      const lessonSlots = calendar.class_schedule[cls.id]?.lesson_slots ?? [];
      if (lessonSlots.length === 0) continue;

      const slug = schoolYearSlug(calendar.school_year);
      const classCalDir = join(calendarsDir, cls.id);
      mkdirSync(classCalDir, { recursive: true });
      const ics = generateClassIcs({ calendar, className: cls.id, classLabel: cls.label });
      writeFileSync(join(classCalDir, `${slug}.ics`), ics);
      listings.push({
        classId: cls.id,
        classLabel: cls.label,
        schoolYear: calendar.school_year,
        icsPath: `${cls.id}/${slug}.ics`,
      });
    }

    if (listings.length > 0) {
      mkdirSync(calendarsDir, { recursive: true });
      writeFileSync(join(calendarsDir, "index.html"), renderCalendarsIndex(listings));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = DEFAULT_REPO_ROOT;
  const outDir = join(repoRoot, "site");
  buildSite({ repoRoot, outDir });
  // The Vite static Calendar bundle runs last and separately from buildSite() itself (kept sync
  // and Vite-free) -- a real vite.build() is too slow to run per buildSite.test.ts case, and this
  // step's correctness is verified end-to-end (npm run build:site + serve site/ locally), not by
  // unit test.
  const { buildStaticCalendarBundle } = await import("./buildStaticCalendarBundle.ts");
  await buildStaticCalendarBundle({ repoRoot, outDir });
  console.log(`Site built at ${outDir}`);
}
