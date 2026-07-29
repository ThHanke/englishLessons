/**
 * Common English function words -- excluded from "new vocabulary" candidates regardless of
 * whether they're in the known-vocabulary set, since they're not target lexis a teacher would
 * ever pre-teach. Deliberately not exhaustive (this is a heuristic aid, not a linguistic parser --
 * see the module doc comment on findNewVocabulary for the accuracy caveat).
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on',
  'at', 'for', 'and', 'or', 'but', 'with', 'from', 'by', 'as', 'that', 'this', 'these', 'those',
  'it', 'its', 'he', 'she', 'they', 'we', 'you', 'i', 'my', 'your', 'his', 'her', 'their', 'our',
  'not', 'no', 'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can', 'could',
  'should', 'must', 'shall', 'may', 'might', 'if', 'than', 'then', 'so', 'very', 'just', 'also',
  'about', 'into', 'over', 'under', 'up', 'down', 'out', 'off', 'again', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'only', 'own', 'same', 'too', 's', 't', 'don', 'now', 'one', 'two', 'three', 'him', 'them',
  'what', 'which', 'who', 'whom', 'am', 'us',
]);

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Blanks out every occurrence of a known multi-word phrase (e.g. "reality show") in `text`,
 * longest-phrase-first so a longer known phrase is masked before a shorter known phrase that
 * happens to be its substring (e.g. masking "reality show" before "show" alone, if "show" were
 * also independently known). Word-boundary matched so "reality showcase" isn't masked by
 * "reality show". Single-word known entries are handled separately by the token-level filter in
 * `findNewVocabulary`, not here.
 */
function maskKnownPhrases(text: string, knownPhrases: readonly string[]): string {
  const sorted = [...knownPhrases].sort((a, b) => b.length - a.length);
  let masked = text;
  for (const phrase of sorted) {
    const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi');
    masked = masked.replace(pattern, (match) => ' '.repeat(match.length));
  }
  return masked;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z']+/)
    .map((t) => t.replace(/'/g, ''))
    .filter((t) => t.length >= 3);
}

/**
 * Finds candidate "new vocabulary" -- words that appear in `texts` but aren't in `known` and
 * aren't common function words. Multi-word known phrases are masked out of the text before
 * tokenizing so their component words don't get individually flagged; single-word known entries
 * are filtered at the token level.
 *
 * This is a heuristic text-scanning aid, not a linguistic parser: it can't distinguish content
 * words from incidental prose (e.g. instructional text embedded in a rendered exercise), and it
 * has no stemming/lemmatization (a known plural or inflected form of a known word will still be
 * flagged as "new"). A teacher should review the candidate list before pre-teaching from it, the
 * same review posture this codebase already takes with `manifest.json`-derived coverage (KTD2).
 */
export function findNewVocabulary(params: { texts: readonly string[]; known: ReadonlySet<string> }): string[] {
  const { texts, known } = params;
  const knownPhrases = [...known].filter((w) => w.includes(' '));

  const found = new Set<string>();
  for (const text of texts) {
    const masked = maskKnownPhrases(text, knownPhrases);
    for (const token of tokenize(masked)) {
      const normalized = normalizeWord(token);
      if (STOPWORDS.has(normalized)) continue;
      if (known.has(normalized)) continue;
      found.add(normalized);
    }
  }
  return [...found].sort();
}
