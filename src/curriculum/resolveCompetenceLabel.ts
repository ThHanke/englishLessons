import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadYaml } from "../schema/yaml.ts";
import type { GradeBand } from "../schema/types.ts";

function walkYamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkYamlFiles(full));
    } else if (entry.endsWith(".yaml") && !entry.endsWith(".draft.yaml")) {
      out.push(full);
    }
  }
  return out;
}

/** Mirrors `src/cli/validateAll.ts`'s `loadBands()` (kept separate rather than shared -- that one
 * is CLI-only and also runs `validateGradeBand`, which this read-only lookup doesn't need),
 * indexed by `GradeBand.id` (e.g. "sa-sek-en-2019.7-8.rs") -- the same id a class's `modules.yaml`
 * declares as `curriculum`. */
export function loadCurriculumBands(repoRoot: string): Map<string, GradeBand> {
  const bandsById = new Map<string, GradeBand>();
  const curriculumDir = join(repoRoot, "curriculum");
  if (!existsSync(curriculumDir)) return bandsById;
  for (const file of walkYamlFiles(curriculumDir)) {
    if (!file.includes("grade-bands")) continue;
    const band = loadYaml<GradeBand>(file);
    bandsById.set(band.id, band);
  }
  return bandsById;
}

/**
 * A `Milestone.assesses`/`Covers.id` entry is a raw curriculum competence id (e.g.
 * "fk.g.passive") -- never human-readable on its own (KTD-none, just how the source data is
 * shaped). This resolves it against the grade-band's own competence catalog, whose entries carry
 * a human-readable label under a different field name per category (`topic` for
 * grammar/vocab/pronunciation/spelling, `statement` for communicative competences, `text` for
 * content fields / hint methods). Falls back to the raw id (never throws) so a stale/renamed id
 * degrades to "less readable," not a crash -- this feeds calendar/ICS display text, not
 * validation.
 */
export function resolveCompetenceLabel(competenceId: string, band: GradeBand): string {
  const fk = band.competence_areas.funktional_kommunikativ;
  for (const entry of fk.kommunikativ) {
    if (entry.id === competenceId) return entry.statement;
  }
  const sm = fk.sprachliche_mittel;
  for (const list of [sm.grammatik, sm.wortschatz, sm.aussprache, sm.orthografie]) {
    for (const entry of list) {
      if (entry.id === competenceId) return entry.topic;
    }
  }
  const ik = band.competence_areas.interkulturell;
  for (const entry of ik.anforderungen) {
    if (entry.id === competenceId) return entry.statement;
  }
  for (const entry of ik.orientierungswissen) {
    if (entry.id === competenceId) return entry.text;
  }
  for (const entry of band.competence_areas.methodisch) {
    if (entry.id === competenceId) return entry.text;
  }
  return competenceId;
}

/** Convenience for the common case: resolve every id in one call, given the class's
 * `modules.yaml curriculum` ref. Falls back to the raw ids unresolved (rather than throwing) when
 * the curriculum ref doesn't match any loaded band -- same "degrade, don't crash" reasoning as
 * `resolveCompetenceLabel`. */
export function resolveCompetenceLabels(
  competenceIds: string[],
  curriculumRef: string,
  bandsById: Map<string, GradeBand>,
): string[] {
  const band = bandsById.get(curriculumRef);
  if (!band) return competenceIds;
  return competenceIds.map((id) => resolveCompetenceLabel(id, band));
}
