import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ModulesFile, LessonSpec } from "../../schema/types.ts";
import type { CoverageDepth, CoverageLedger, CoveredRecord, LessonCoverage } from "../../coverage/types.ts";
import { coverageLedger } from "../../coverage/ledger.ts";

const DEFAULT_REPO_ROOT = new URL("../../../", import.meta.url).pathname;

function walkFilesNamed(dir: string, filename: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkFilesNamed(full, filename));
    } else if (entry === filename) {
      out.push(full);
    }
  }
  return out;
}

export function walkLessonSpecFiles(dir: string): string[] {
  return walkFilesNamed(dir, "lesson-spec.json");
}

function walkManifestFiles(dir: string): string[] {
  return walkFilesNamed(dir, "manifest.json");
}

interface ManifestFile {
  class: string;
  date: string;
  materials: Array<{
    file: string;
    type: string;
    title: string;
    competenceIds: string[];
    depth: string;
    createdAt: string;
  }>;
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
 * `manifest.json` (§3.7a's `covered` record) is stronger evidence than a lesson-spec plan — a
 * widget was actually generated and saved, not just planned. Each entry's `competenceIds` fans
 * out to one `CoveredRecord` per competence (matching `CoveredRecord`'s one-competence-per-record
 * shape already used by `lessonSpecToCoverage`). Named limitation (KTD2): this proves a worksheet
 * was authored, not that it was assigned to or completed by a pupil.
 */
function manifestToCoverage(manifest: ManifestFile, date: string): LessonCoverage {
  const covered: CoveredRecord[] = [];
  for (const entry of manifest.materials) {
    for (const competenceId of entry.competenceIds) {
      covered.push({
        competence: competenceId,
        depth: entry.depth as CoverageDepth,
        via: [entry.type],
      });
    }
  }
  return { date, covered, topics: [] };
}

/**
 * Scans `<repoRoot>/artifacts/<className>/**\/lesson-spec.json` and `**\/manifest.json` into
 * `LessonCoverage[]` and folds them into a `CoverageLedger` via `coverageLedger`. A class with no
 * `artifacts/<className>` directory on disk yet (day-one state, before Phase 3's generation
 * skills exist) returns an empty-but-valid ledger rather than throwing.
 *
 * `coverageLedger`'s existing max-depth-wins folding picks the stronger depth per competence when
 * both a lesson-spec ('introduced') and a manifest entry ('practiced') exist for the same
 * date+competence -- no special-casing needed here, both lists just get folded in together.
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
  const specLessons = specFiles.map((f) =>
    lessonSpecToCoverage(JSON.parse(readFileSync(f, "utf-8")) as LessonSpec),
  );

  const manifestFiles = walkManifestFiles(classDir);
  const manifestLessons = manifestFiles.map((f) => {
    const manifest = JSON.parse(readFileSync(f, "utf-8")) as ManifestFile;
    return manifestToCoverage(manifest, manifest.date);
  });

  return coverageLedger([...specLessons, ...manifestLessons], modulesFile);
}

/** Max date among a class's `manifest.json` files -- materials actually generated is stronger
 * "delivered" evidence than a plan (`manifestToCoverage`'s own doc comment), so this prefers
 * manifest dates and only falls back to `lesson-spec.json` dates when no manifest exists yet
 * (planned but not yet generated). Null when the class has no artifacts at all. Feeds
 * `driftReport`'s `actualLastTaughtDate` (`coverage/driftReport.ts`). */
export function lastTaughtDate(
  className: string,
  repoRoot: string = DEFAULT_REPO_ROOT,
): string | null {
  const classDir = join(repoRoot, "artifacts", className);
  if (!existsSync(classDir)) return null;

  const manifestDates = walkManifestFiles(classDir).map(
    (f) => (JSON.parse(readFileSync(f, "utf-8")) as ManifestFile).date,
  );
  if (manifestDates.length > 0) {
    return manifestDates.reduce((a, b) => (a > b ? a : b));
  }

  const specDates = walkLessonSpecFiles(classDir).map(
    (f) => (JSON.parse(readFileSync(f, "utf-8")) as LessonSpec).date,
  );
  return specDates.length > 0 ? specDates.reduce((a, b) => (a > b ? a : b)) : null;
}

/** `{ date, moduleId, slotId }` for every `lesson-spec.json` already landed for a class — the
 * "already planned lessons" markers a module's spanning task shows on hover (R11). `slotId` is
 * derived from the artifact path (the immediate parent directory name, when it isn't the date
 * itself) rather than stored in the spec JSON -- see `artifactPath.ts`'s shape: flat for a class
 * that can't have more than one lesson per day, `<date>/<slotId>/` when it can. */
export function listLessonSpecs(
  className: string,
  repoRoot: string = DEFAULT_REPO_ROOT,
): Array<{ date: string; moduleId: string; slotId?: string }> {
  const classDir = join(repoRoot, "artifacts", className);
  if (!existsSync(classDir)) return [];
  return walkLessonSpecFiles(classDir).map((f) => {
    const spec = JSON.parse(readFileSync(f, "utf-8")) as LessonSpec;
    const parentDirName = basename(dirname(f));
    const slotId = parentDirName === spec.date ? undefined : parentDirName;
    return { date: spec.date, moduleId: spec.module.id, slotId };
  });
}
