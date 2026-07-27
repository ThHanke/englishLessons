import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ModulesFile, LessonSpec } from "../../schema/types.ts";
import type { CoverageLedger, LessonCoverage } from "../../coverage/types.ts";
import { coverageLedger } from "../../coverage/ledger.ts";

const DEFAULT_REPO_ROOT = new URL("../../../", import.meta.url).pathname;

export function walkLessonSpecFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkLessonSpecFiles(full));
    } else if (entry === "lesson-spec.json") {
      out.push(full);
    }
  }
  return out;
}

/**
 * `lesson-spec.json` is a pre-lesson *plan* artifact (§3.4/§3.6), not a confirmed
 * delivered-coverage record - so every competence it names is folded in at ledger depth
 * 'introduced' only, never 'practiced'/'assessed'. Treating a plan as a full delivery would
 * overstate real coverage; this cap is intentional, not a modeling bug.
 */
function lessonSpecToCoverage(spec: LessonSpec): LessonCoverage {
  return {
    date: spec.date,
    covered: spec.focus_competences.map((fc) => ({
      competence: fc.id,
      depth: "introduced",
      via: spec.suggested_exercise_types,
    })),
    topics: [],
  };
}

/**
 * Scans `<repoRoot>/artifacts/<className>/**\/lesson-spec.json` into `LessonCoverage[]` and
 * folds them into a `CoverageLedger` via `coverageLedger`. A class with no `artifacts/<className>`
 * directory on disk yet (day-one state, before Phase 3's generation skills exist) returns an
 * empty-but-valid ledger rather than throwing.
 */
export function buildLedger(
  className: string,
  modulesFile: ModulesFile,
  repoRoot: string = DEFAULT_REPO_ROOT,
): CoverageLedger {
  const classDir = join(repoRoot, "artifacts", className);
  if (!existsSync(classDir)) {
    return coverageLedger([], modulesFile);
  }
  const specFiles = walkLessonSpecFiles(classDir);
  const lessons = specFiles.map((f) =>
    lessonSpecToCoverage(JSON.parse(readFileSync(f, "utf-8")) as LessonSpec),
  );
  return coverageLedger(lessons, modulesFile);
}

/** `{ date, moduleId }` for every `lesson-spec.json` already landed for a class — the "already
 * planned lessons" markers a module's spanning task shows on hover (R11). */
export function listLessonSpecs(
  className: string,
  repoRoot: string = DEFAULT_REPO_ROOT,
): Array<{ date: string; moduleId: string }> {
  const classDir = join(repoRoot, "artifacts", className);
  if (!existsSync(classDir)) return [];
  return walkLessonSpecFiles(classDir).map((f) => {
    const spec = JSON.parse(readFileSync(f, "utf-8")) as LessonSpec;
    return { date: spec.date, moduleId: spec.module.id };
  });
}
