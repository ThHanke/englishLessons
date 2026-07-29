import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { checkOrder, renderReorderHtml, type ReorderItem } from './reorder.ts';

function loadDom(html: string) {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  return dom.window.document;
}

function currentOrder(document: Document, itemIndex: number): number[] {
  return Array.from(
    document.querySelectorAll(`ol.fragments[data-item="${itemIndex}"] > li`),
  ).map((li) => Number(li.getAttribute('data-original')));
}

describe('checkOrder', () => {
  it('is correct only for the identity order', () => {
    expect(checkOrder([0, 1, 2], 3)).toBe('correct');
    expect(checkOrder([0, 2, 1], 3)).toBe('incorrect');
  });

  it('is unanswered when the candidate length does not match', () => {
    expect(checkOrder([0, 1], 3)).toBe('unanswered');
  });
});

describe('renderReorderHtml', () => {
  const items: ReorderItem[] = [
    { fragments: ['First, wake up.', 'Then, eat breakfast.', 'Finally, go to school.'] },
  ];

  it('is a self-contained HTML file with no external script/link references', () => {
    const html = renderReorderHtml('Morning Routine', items, 1);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('shuffles the same seed to the same output every time (not flaky)', () => {
    const htmlA = renderReorderHtml('Morning Routine', items, 7);
    const htmlB = renderReorderHtml('Morning Routine', items, 7);
    expect(htmlA).toBe(htmlB);
  });

  it('never renders the fragments already in their correct order', () => {
    // With n > 1 fragments, shuffledIndices re-shuffles once if it lands on identity order --
    // check across a spread of seeds that none slip through as already-solved.
    for (let seed = 0; seed < 20; seed++) {
      const html = renderReorderHtml('Morning Routine', items, seed);
      const document = loadDom(html);
      expect(currentOrder(document, 0)).not.toEqual([0, 1, 2]);
    }
  });

  it('escapes HTML in fragment text', () => {
    const html = renderReorderHtml('XSS check', [{ fragments: ['<script>x</script>', 'safe'] }], 0);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('moves a fragment up/down and updates data-pos accordingly', () => {
    const html = renderReorderHtml('Morning Routine', items, 1);
    const document = loadDom(html);
    const before = currentOrder(document, 0);
    // Move the last row up once.
    const lastRow = document.querySelector(
      `ol.fragments[data-item="0"] > li[data-pos="${before.length - 1}"]`,
    )!;
    (lastRow.querySelector('button.up') as HTMLElement).click();
    const after = currentOrder(document, 0);
    expect(after[after.length - 2]).toBe(before[before.length - 1]);
  });

  it('self-check marks every row correct once reordered into the original order', () => {
    const html = renderReorderHtml('Morning Routine', items, 1);
    const document = loadDom(html);
    // Repeatedly move the first row down until the order is back to [0, 1, 2].
    for (let guard = 0; guard < 20 && !currentOrder(document, 0).every((v, i) => v === i); guard++) {
      const firstWrong = currentOrder(document, 0).findIndex((v, i) => v !== i);
      const row = document.querySelector(
        `ol.fragments[data-item="0"] > li[data-pos="${firstWrong}"]`,
      )!;
      (row.querySelector('button.down') as HTMLElement).click();
    }
    expect(currentOrder(document, 0)).toEqual([0, 1, 2]);

    (document.querySelector('button.check[data-item="0"]') as HTMLElement).click();
    expect(document.querySelector('[data-result="0"]')?.textContent).toBe('Correct order!');
    expect(document.querySelectorAll('li.fragment.incorrect').length).toBe(0);
  });

  it('self-check flags a still-wrong order as incorrect', () => {
    const html = renderReorderHtml('Morning Routine', items, 1);
    const document = loadDom(html);
    (document.querySelector('button.check[data-item="0"]') as HTMLElement).click();
    expect(document.querySelector('[data-result="0"]')?.textContent).toBe('Not quite -- keep reordering.');
    expect(document.querySelectorAll('li.fragment.incorrect').length).toBeGreaterThan(0);
  });
});
