import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderFlashcardsHtml, type FlashcardItem } from './flashcards.ts';

function loadDom(html: string) {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  return dom.window.document;
}

describe('renderFlashcardsHtml', () => {
  const items: FlashcardItem[] = [
    { front: 'apple', back: 'der Apfel' },
    { front: 'dog', back: 'der Hund' },
  ];

  it('is a self-contained HTML file with no external script/link references', () => {
    const html = renderFlashcardsHtml('Vocab Cards', items);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('escapes HTML in front/back text', () => {
    const html = renderFlashcardsHtml('XSS check', [
      { front: '<script>x</script>', back: 'safe' },
    ]);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('starts every card showing the front, not the back', () => {
    const html = renderFlashcardsHtml('Vocab Cards', items);
    const document = loadDom(html);
    document.querySelectorAll('.card').forEach((card) => {
      expect(card.getAttribute('data-state')).toBe('front');
    });
  });

  it('flips a card to show the back on click, and back to front on a second click', () => {
    const html = renderFlashcardsHtml('Vocab Cards', items);
    const document = loadDom(html);
    const flipBtn = document.querySelector('button.flip[data-card="0"]') as HTMLElement;
    flipBtn.click();
    expect(document.querySelector('.card[data-card="0"]')?.getAttribute('data-state')).toBe('back');
    flipBtn.click();
    expect(document.querySelector('.card[data-card="0"]')?.getAttribute('data-state')).toBe('front');
  });

  it('reveals the rating buttons only after the first flip', () => {
    const html = renderFlashcardsHtml('Vocab Cards', items);
    const document = loadDom(html);
    expect((document.querySelector('.rate[data-rate="0"]') as HTMLElement).hidden).toBe(true);
    (document.querySelector('button.flip[data-card="0"]') as HTMLElement).click();
    expect((document.querySelector('.rate[data-rate="0"]') as HTMLElement).hidden).toBe(false);
  });

  it('tallies self-ratings into the summary line', () => {
    const html = renderFlashcardsHtml('Vocab Cards', items);
    const document = loadDom(html);
    (document.querySelector('button.know[data-card="0"]') as HTMLElement).click();
    (document.querySelector('button.learning[data-card="1"]') as HTMLElement).click();
    expect(document.getElementById('summary')?.textContent).toBe('1 / 2 known so far (2 cards total)');
  });
});
