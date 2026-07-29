import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadYaml } from "../../schema/yaml.ts";
import type { ClassFile } from "../../schema/types.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATED_JSON_FILES = ["lesson-spec.json", "lesson-plan.json", "manifest.json"];

/** Mirrors routes/artifacts.ts's `isKnownClassName` -- same class-name whitelist, needed for the
 * same reason: `className` is caller-supplied and gets joined into a filesystem path below, so it
 * must be checked against the real class list before that join happens. */
function isKnownClassName(className: string, repoRoot: string): boolean {
  const plansDir = join(repoRoot, "plans");
  if (!existsSync(plansDir)) return false;
  for (const gradeDir of readdirSync(plansDir)) {
    const dirPath = join(plansDir, gradeDir);
    if (!statSync(dirPath).isDirectory()) continue;
    const classPath = join(dirPath, "class.yaml");
    if (!existsSync(classPath)) continue;
    const classFile = loadYaml<ClassFile>(classPath);
    if (classFile.name === className) return true;
  }
  return false;
}

export interface RescheduleResult {
  moved: boolean;
  error?: string;
}

/**
 * Moves one dated lesson's content -- `artifacts/<class>/<fromDate>/` and the `date` field inside
 * its `lesson-spec.json`/`lesson-plan.json`/`manifest.json` -- to a new date, without
 * regenerating anything. `date` is the only persisted identity a lesson has: the coverage ledger,
 * `gapReport`, and `driftReport` all recompute live from the artifacts tree (`buildLedger.ts`
 * walks it fresh each call), so renaming the directory and patching those three `date` fields is
 * sufficient -- there's no separate index to migrate.
 *
 * Validation order is load-bearing (mirrors `routes/artifacts.ts`): `className` and both dates
 * are checked against a strict whitelist/format before any filesystem path is built from them.
 */
export function rescheduleLesson(params: {
  className: string;
  fromDate: string;
  toDate: string;
  repoRoot: string;
}): RescheduleResult {
  const { className, fromDate, toDate, repoRoot } = params;

  if (!isKnownClassName(className, repoRoot)) {
    return { moved: false, error: `Unknown class "${className}"` };
  }
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
    return { moved: false, error: "fromDate and toDate must be YYYY-MM-DD" };
  }
  if (fromDate === toDate) {
    return { moved: false, error: "fromDate and toDate are the same" };
  }

  const classDir = join(repoRoot, "artifacts", className);
  const fromDir = join(classDir, fromDate);
  const toDir = join(classDir, toDate);

  if (!existsSync(fromDir)) {
    return { moved: false, error: `No artifacts found for ${className}/${fromDate}` };
  }
  if (existsSync(toDir)) {
    return {
      moved: false,
      error: `${className}/${toDate} already has content -- refusing to overwrite`,
    };
  }

  renameSync(fromDir, toDir);

  for (const filename of DATED_JSON_FILES) {
    const filePath = join(toDir, filename);
    if (!existsSync(filePath)) continue;
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    data.date = toDate;
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  return { moved: true };
}
