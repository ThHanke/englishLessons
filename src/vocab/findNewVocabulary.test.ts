import { describe, it, expect } from 'vitest';
import { findNewVocabulary } from './findNewVocabulary.ts';

describe('findNewVocabulary', () => {
  it('finds a genuinely new word not in the known set', () => {
    const result = findNewVocabulary({
      texts: ['The caretaker cleans the classroom.'],
      known: new Set(['classroom', 'clean']),
    });
    expect(result).toContain('caretaker');
  });

  it('excludes words already in the known set', () => {
    const result = findNewVocabulary({
      texts: ['The caretaker cleans the classroom.'],
      known: new Set(['caretaker', 'classroom', 'clean', 'cleans']),
    });
    expect(result).not.toContain('caretaker');
    expect(result).not.toContain('classroom');
  });

  it('excludes common stopwords even when not in the known set', () => {
    const result = findNewVocabulary({
      texts: ['The dog is chasing the cat with a stick.'],
      known: new Set(),
    });
    expect(result).not.toContain('the');
    expect(result).not.toContain('is');
    expect(result).not.toContain('with');
    expect(result).toContain('dog');
    expect(result).toContain('chasing');
    expect(result).toContain('cat');
    expect(result).toContain('stick');
  });

  it('masks a known multi-word phrase so its component words are not flagged individually', () => {
    const result = findNewVocabulary({
      texts: ['We watched a reality show about cooking last night.'],
      known: new Set(['reality show']),
    });
    expect(result).not.toContain('reality');
    expect(result).not.toContain('show');
    expect(result).toContain('watched');
    expect(result).toContain('cooking');
  });

  it('word-boundary matches a known phrase, not a substring of a longer different word', () => {
    const result = findNewVocabulary({
      texts: ['They watched a reality showcase yesterday.'],
      known: new Set(['reality show']),
    });
    // "reality showcase" must NOT be masked by "reality show" -- both words should still surface.
    expect(result).toContain('reality');
    expect(result).toContain('showcase');
  });

  it('masks the longer of two overlapping known phrases first', () => {
    const result = findNewVocabulary({
      texts: ['I love a good reality show on television.'],
      known: new Set(['reality show', 'show']),
    });
    expect(result).not.toContain('reality');
    expect(result).not.toContain('show');
  });

  it('is case-insensitive for both tokens and known phrases', () => {
    const result = findNewVocabulary({
      texts: ['REALITY SHOW time!'],
      known: new Set(['reality show']),
    });
    expect(result).not.toContain('reality');
    expect(result).not.toContain('show');
  });

  it('dedupes repeated words across multiple texts', () => {
    const result = findNewVocabulary({
      texts: ['The caretaker arrived.', 'The caretaker left.'],
      known: new Set(),
    });
    expect(result.filter((w) => w === 'caretaker')).toHaveLength(1);
  });

  it('returns an empty array for empty input, not a crash', () => {
    expect(findNewVocabulary({ texts: [], known: new Set() })).toEqual([]);
    expect(findNewVocabulary({ texts: [''], known: new Set() })).toEqual([]);
  });

  it('strips punctuation and short tokens', () => {
    const result = findNewVocabulary({
      texts: ["It's a big, big dog!"],
      known: new Set(),
    });
    expect(result).toContain('big');
    expect(result).toContain('dog');
    expect(result).not.toContain('a');
  });
});
