import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { checkWord, renderMarkTheWordsHtml, type MarkTheWordsItem } from './markTheWords.ts';

function loadDom(html: string) {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  return dom.window.document;
}

describe('checkWord', () => {
  const targets = [1, 3];

  it('is a hit when a target word is marked', () => {
    expect(checkWord(1, new Set([1]), targets)).toBe('hit');
  });

  it('is a miss when a target word is not marked', () => {
    expect(checkWord(1, new Set(), targets)).toBe('miss');
  });

  it('is a false-positive when a non-target word is marked', () => {
    expect(checkWord(0, new Set([0]), targets)).toBe('false-positive');
  });

  it('is a correct-omission when a non-target word is left unmarked', () => {
    expect(checkWord(0, new Set(), targets)).toBe('correct-omission');
  });
});

describe('renderMarkTheWordsHtml', () => {
  const items: MarkTheWordsItem[] = [
    {
      text: 'She walked to school and ate lunch.',
      targetIndices: [1, 5], // "walked", "ate" -- the past-tense verbs
      instruction: 'Click every past-tense verb.',
    },
  ];

  it('is a self-contained HTML file with no external script/link references', () => {
    const html = renderMarkTheWordsHtml('Past Tense Verbs', items);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('escapes HTML in the instruction and passage text', () => {
    const html = renderMarkTheWordsHtml('XSS check', [
      { text: '<script>x</script> word', targetIndices: [], instruction: '<b>hi</b>' },
    ]);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });

  it('splits the passage into one clickable word per whitespace-separated token', () => {
    const html = renderMarkTheWordsHtml('Past Tense Verbs', items);
    const document = loadDom(html);
    expect(document.querySelectorAll('button.word[data-item="0"]').length).toBe(7);
  });

  it('marks hits and misses correctly when checked', () => {
    const html = renderMarkTheWordsHtml('Past Tense Verbs', items);
    const document = loadDom(html);
    // Click "walked" (index 1) -- correct -- and "school" (index 3) -- a false positive --
    // but leave "ate" (index 5) unmarked -- a miss.
    (document.querySelector('button.word[data-word="1"]') as HTMLElement).click();
    (document.querySelector('button.word[data-word="3"]') as HTMLElement).click();
    (document.querySelector('button.check[data-item="0"]') as HTMLElement).click();

    expect(document.querySelector('button.word[data-word="1"]')?.classList.contains('hit')).toBe(true);
    expect(
      document.querySelector('button.word[data-word="3"]')?.classList.contains('false-positive'),
    ).toBe(true);
    expect(document.querySelector('button.word[data-word="5"]')?.classList.contains('miss')).toBe(true);
    expect(document.querySelector('[data-result="0"]')?.textContent).toBe('1 / 2 found, 1 extra word marked');
  });

  it('clicking a word toggles it marked, and checking clears the marked class', () => {
    const html = renderMarkTheWordsHtml('Past Tense Verbs', items);
    const document = loadDom(html);
    const btn = document.querySelector('button.word[data-word="1"]') as HTMLElement;
    btn.click();
    expect(btn.classList.contains('marked')).toBe(true);
    btn.click();
    expect(btn.classList.contains('marked')).toBe(false);
  });

  it('reports a perfect score when every target is marked and nothing else is', () => {
    const html = renderMarkTheWordsHtml('Past Tense Verbs', items);
    const document = loadDom(html);
    (document.querySelector('button.word[data-word="1"]') as HTMLElement).click();
    (document.querySelector('button.word[data-word="5"]') as HTMLElement).click();
    (document.querySelector('button.check[data-item="0"]') as HTMLElement).click();
    expect(document.querySelector('[data-result="0"]')?.textContent).toBe('2 / 2 found');
  });
});
