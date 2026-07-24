import { describe, it, expect } from 'vitest';
import { loadNgslSet, levelWord, levelWordList } from './leveling.ts';

const ngslPath = new URL('../../data/wordlists/ngsl-1.2.csv', import.meta.url).pathname;

describe('loadNgslSet', () => {
  it('loads the vendored NGSL csv into a non-trivial lemma set', () => {
    const ngsl = loadNgslSet(ngslPath);
    expect(ngsl.size).toBeGreaterThan(2000);
    expect(ngsl.has('the')).toBe(true);
    expect(ngsl.has('time')).toBe(true);
  });
});

describe('levelWord', () => {
  const ngsl = new Set(['time', 'hobby', 'region', 'school', 'weather']);

  it('accepts a word present in NGSL', () => {
    expect(levelWord('school', ngsl).status).toBe('accepted');
  });

  it('flags a word absent from NGSL', () => {
    const result = levelWord('xyzzy', ngsl);
    expect(result.status).toBe('flagged');
    expect(result.route).toBe('cefr_fallback');
  });

  it('is case/whitespace-insensitive', () => {
    expect(levelWord('School', ngsl).status).toBe('accepted');
    expect(levelWord('  school  ', ngsl).status).toBe('accepted');
    expect(levelWord('Free Time', new Set(['time'])).status).toBe('accepted');
  });

  it('screens multi-word items by head word (last token) when the whole phrase is not listed', () => {
    expect(levelWord('free time', ngsl).status).toBe('accepted'); // head word "time" is listed
    expect(levelWord('once a week', ngsl).status).toBe('flagged'); // head word "week" is not listed
  });

  it('routes a flagged proper noun to cefr_fallback, not an automatic reject', () => {
    const result = levelWord('London', ngsl);
    expect(result.status).toBe('flagged');
    expect(result.route).toBe('cefr_fallback');
    expect(result.likelyProperNoun).toBe(true);
  });

  it('does not mark a flagged lowercase word as a likely proper noun', () => {
    const result = levelWord('countryside', ngsl);
    expect(result.status).toBe('flagged');
    expect(result.likelyProperNoun).toBe(false);
  });
});

describe('levelWordList', () => {
  it('returns an empty array for an empty module list without crashing', () => {
    expect(levelWordList([], new Set())).toEqual([]);
  });
});
