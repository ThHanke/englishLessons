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
import type { ClassFile, LessonSpec } from "../schema/types.ts";
import { walkLessonSpecFiles } from "../companion/server/buildLedger.ts";
import { renderLessonPage, type LessonPlan, type Manifest } from "./renderLessonPage.ts";

const DEFAULT_REPO_ROOT = new URL("../../", import.meta.url).pathname;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Mirrors dateContext.ts's loadClassData pattern: scans plans/&lowast;/class.yaml for the known class list. */
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
  specPath: string;
}

/** Reuses buildLedger.ts's recursive lesson-spec.json walk, then derives each date from its
 * immediate parent directory name (artifacts/<class>/<date>/lesson-spec.json). */
function findLessonEntries(className: string, repoRoot: string): LessonEntry[] {
  const classDir = join(repoRoot, "artifacts", className);
  if (!existsSync(classDir)) return [];
  return walkLessonSpecFiles(classDir)
    .map((specPath) => ({ date: basename(dirname(specPath)), specPath }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function renderClassIndex(className: string, dates: string[]): string {
  const items = dates
    .map((date) => `<li><a href="${escapeHtml(date)}/">${escapeHtml(date)}</a></li>`)
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

/**
 * Walks plans/&lowast;/class.yaml for the known class list, then artifacts/<class>/**\/lesson-spec.json
 * for every date already planned, and writes a full static site/ tree (§4.7 URL scheme) to
 * `outDir`. Full regeneration each run (outDir is wiped first) so re-running is idempotent - no
 * incremental append/merge logic. Classes with zero lesson-spec.json on disk are omitted from
 * the listings entirely (nothing to link to yet), and a repo with no artifacts/ directory at
 * all still produces a valid site/ with a root index listing zero classes, not a throw.
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

    for (const entry of entries) {
      const lessonDir = join(classDir, entry.date);
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
        ? readdirSync(materialsSrcDir)
            .filter((f) => f.endsWith(".html"))
            .sort()
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
    }

    writeFileSync(
      join(classDir, "index.html"),
      renderClassIndex(className, entries.map((e) => e.date)),
    );
    publishedClasses.push(className);
  }

  writeFileSync(join(outDir, "index.html"), renderRootIndex(publishedClasses));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = DEFAULT_REPO_ROOT;
  const outDir = join(repoRoot, "site");
  buildSite({ repoRoot, outDir });
  console.log(`Site built at ${outDir}`);
}
