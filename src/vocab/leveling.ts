import { readFileSync } from 'node:fs';

export type LevelStatus = 'accepted' | 'flagged';

export interface WordLevelResult {
  word: string;
  status: LevelStatus;
  /** Present when status === 'flagged'. Words absent from NGSL always route to the CEFR-fallback
   * pass + teacher review (KTD6) - never an automatic reject. likelyProperNoun is an informational
   * hint (proper nouns are expected to be flagged, not a sign of a bad word). */
  route?: 'cefr_fallback';
  likelyProperNoun?: boolean;
}

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

function isLikelyProperNoun(word: string): boolean {
  const first = word.trim().charAt(0);
  return first !== '' && first === first.toUpperCase() && first !== first.toLowerCase();
}

/** Parses the vendored NGSL CSV (Lemma, SFI Rank, SFI, Adjusted Frequency per Million) into a lookup set of lemmas. */
export function loadNgslSet(csvPath: string): Set<string> {
  const raw = readFileSync(csvPath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const set = new Set<string>();
  // skip header row
  for (const line of lines.slice(1)) {
    const lemma = line.split(',')[0];
    if (lemma) set.add(normalize(lemma));
  }
  return set;
}

/**
 * Multi-word screening rule (documented per plan Open Questions): try the whole phrase
 * against NGSL first (NGSL is single-lemma, so this rarely hits); otherwise fall back to the
 * phrase's head word — the last token (e.g. "free time" -> "time") — since NGSL has no
 * multi-word entries and the head noun is the best single-token proxy for the phrase's level.
 */
export function levelWord(word: string, ngsl: ReadonlySet<string>): WordLevelResult {
  const normalized = normalize(word);
  if (ngsl.has(normalized)) {
    return { word, status: 'accepted' };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const headWord = tokens[tokens.length - 1]!;
    if (ngsl.has(headWord)) {
      return { word, status: 'accepted' };
    }
  }

  return { word, status: 'flagged', route: 'cefr_fallback', likelyProperNoun: isLikelyProperNoun(word) };
}

export function levelWordList(words: readonly string[], ngsl: ReadonlySet<string>): WordLevelResult[] {
  return words.map((w) => levelWord(w, ngsl));
}
