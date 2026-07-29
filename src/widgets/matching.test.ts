import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMatchingHtml, type MatchingPair } from './matching.ts';

function loadDom(html: string) {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  return dom.window.document;
}

function pair(document: Document, leftIndex: number, rightOriginalIndex: number) {
  (document.querySelector(`.item.left[data-left="${leftIndex}"]`) as HTMLElement).click();
  (document.querySelector(`.item.right[data-right="${rightOriginalIndex}"]`) as HTMLElement).click();
}

describe('renderMatchingHtml shuffling', () => {
  const pairs: MatchingPair[] = [
    { left: 'cat', right: 'gato' },
    { left: 'dog', right: 'perro' },
    { left: 'bird', right: 'pajaro' },
    { left: 'fish', right: 'pez' },
  ];

  it('is a self-contained HTML file with no external script/link references', () => {
    const html = renderMatchingHtml('Matching Practice', pairs, 1);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('shuffles the same seed to the same output every time (not flaky)', () => {
    const htmlA = renderMatchingHtml('Matching Practice', pairs, 7);
    const htmlB = renderMatchingHtml('Matching Practice', pairs, 7);
    expect(htmlA).toBe(htmlB);
  });

  it('produces every original right-hand index exactly once regardless of seed', () => {
    const html = renderMatchingHtml('Matching Practice', pairs, 42);
    for (let i = 0; i < pairs.length; i++) {
      expect((html.match(new RegExp(`data-right="${i}"`, 'g')) ?? []).length).toBe(1);
    }
  });

  it('escapes HTML in left/right text', () => {
    const html = renderMatchingHtml('XSS check', [{ left: '<script>x</script>', right: 'safe' }], 0);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});

describe('renderMatchingHtml self-check', () => {
  const pairs: MatchingPair[] = [
    { left: 'cat', right: 'gato' },
    { left: 'dog', right: 'perro' },
    { left: 'bird', right: 'pajaro' },
  ];

  it('marks a fully correct pairing as fully correct', () => {
    const html = renderMatchingHtml('Matching Practice', pairs, 3);
    const document = loadDom(html);
    for (let i = 0; i < pairs.length; i++) pair(document, i, i);
    (document.getElementById('check') as HTMLElement).click();

    expect(document.getElementById('result')?.textContent).toBe('3 / 3 correct');
    expect(document.querySelectorAll('.item.incorrect').length).toBe(0);
    expect(document.querySelectorAll('.item.correct').length).toBe(pairs.length * 2);
  });

  it('marks a fully incorrect (deranged) pairing as fully incorrect', () => {
    const html = renderMatchingHtml('Matching Practice', pairs, 3);
    const document = loadDom(html);
    // derangement: left i paired with right (i+1 mod n)
    for (let i = 0; i < pairs.length; i++) pair(document, i, (i + 1) % pairs.length);
    (document.getElementById('check') as HTMLElement).click();

    expect(document.getElementById('result')?.textContent).toBe('0 / 3 correct');
    expect(document.querySelectorAll('.item.correct').length).toBe(0);
    expect(document.querySelectorAll('.item.incorrect').length).toBe(pairs.length * 2);
  });

  it('keys pairing off index, not text, so duplicate left/right values never collide', () => {
    const duplicatePairs: MatchingPair[] = [
      { left: 'cat', right: 'animal' },
      { left: 'cat', right: 'animal' },
    ];
    const html = renderMatchingHtml('Duplicates', duplicatePairs, 5);
    const document = loadDom(html);
    // Swap: left0 <-> right1, left1 <-> right0. Text is identical for both pairs,
    // but position-keyed checking must still flag this as incorrect.
    pair(document, 0, 1);
    pair(document, 1, 0);
    (document.getElementById('check') as HTMLElement).click();

    expect(document.getElementById('result')?.textContent).toBe('0 / 2 correct');
  });
});
