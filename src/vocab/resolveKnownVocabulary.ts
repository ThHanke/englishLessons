import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadYaml } from "../schema/yaml.ts";
import type { VocabularyFile } from "../schema/types.ts";

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

function loadVocabFilesByStem(vocabDir: string): Record<string, VocabularyFile> {
  const files: Record<string, VocabularyFile> = {};
  for (const entry of readdirSync(vocabDir).filter((f) => f.endsWith(".yaml"))) {
    const stem = entry.replace(/\.yaml$/, "");
    files[stem] = loadYaml<VocabularyFile>(join(vocabDir, entry));
  }
  return files;
}

function ownWords(file: VocabularyFile): Set<string> {
  const set = new Set<string>();
  for (const words of Object.values(file.modules)) {
    for (const w of words) set.add(normalizeWord(w));
  }
  for (const w of file.overrides?.add ?? []) set.add(normalizeWord(w));
  return set;
}

/**
 * Resolves a `known_vocab_ref` (e.g. "grade-7-realschule-2026@m3") to the full cumulative set of
 * already-known/introduced vocabulary for that class, per docs/spec/01-data-model.md §3.6:
 * every predecessor grade's vocabulary in full (via `inherits_from`) plus the current grade's
 * own modules -- which already only extend to `taught_through` (the vocabulary file itself is
 * only ever generated up to that cutoff, so there is nothing beyond it to additionally filter
 * here). The `@<module>` suffix in the ref is a lesson-lookup label only and plays no part in
 * this resolution (per spec: "the vocabulary cutoff always comes from taught_through, independent
 * of the suffix").
 *
 * Trusts the committed vocabulary files are already valid (acyclic, no re-introduction) --
 * `npm run validate`'s `validateVocabChain` (src/validate/referentialValidator.ts) is the
 * enforcement point for that; this function does no cycle detection of its own.
 *
 * Words are normalized (trim + lowercase); multi-word phrases (e.g. "reality show") are kept as
 * single set entries, not split into individual words.
 */
export function resolveKnownVocabulary(knownVocabRef: string, repoRoot: string): Set<string> {
  const className = knownVocabRef.split("@")[0]!;
  const vocabDir = join(repoRoot, "vocabulary");
  const filesByStem = loadVocabFilesByStem(vocabDir);

  const stem = Object.keys(filesByStem).find((key) => filesByStem[key]!.class === className);
  if (!stem) {
    throw new Error(`No vocabulary/*.yaml file found with class "${className}"`);
  }

  function resolve(currentStem: string): Set<string> {
    const file = filesByStem[currentStem];
    if (!file) {
      throw new Error(`known_vocab_ref chain references missing vocabulary file "${currentStem}"`);
    }
    const known = file.inherits_from ? resolve(file.inherits_from) : new Set<string>();
    for (const w of ownWords(file)) known.add(w);
    for (const w of file.overrides?.remove ?? []) known.delete(normalizeWord(w));
    return known;
  }

  return resolve(stem);
}
