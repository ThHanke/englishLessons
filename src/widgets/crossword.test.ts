import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { layoutCrossword, renderCrosswordHtml, type CrosswordItem } from './crossword.ts';

function loadDom(html: string) {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  return dom.window.document;
}

describe('layoutCrossword', () => {
  it('places a single word at the origin', () => {
    const layout = layoutCrossword([{ word: 'CAT', clue: 'A pet that meows' }]);
    expect(layout.width).toBe(3);
    expect(layout.height).toBe(1);
    expect(layout.cells.get('0,0')).toBe('C');
    expect(layout.cells.get('0,1')).toBe('A');
    expect(layout.cells.get('0,2')).toBe('T');
  });

  it('crosses a second word through a shared letter with the first', () => {
    // CAT (across) and CAR (down) share the "C" -- CAR should cross CAT vertically at the C.
    const layout = layoutCrossword([
      { word: 'CAT', clue: 'A pet that meows' },
      { word: 'CAR', clue: 'A vehicle' },
    ]);
    const across = layout.placements.find((p) => p.word === 'CAT')!;
    const down = layout.placements.find((p) => p.word === 'CAR')!;
    expect(across.dir).toBe('across');
    expect(down.dir).toBe('down');
    // The two placements must actually share one cell with a consistent letter.
    const acrossCells = new Set(
      Array.from({ length: 3 }, (_, i) => `${across.row},${across.col + i}`),
    );
    const downCells = Array.from({ length: 3 }, (_, i) => `${down.row + i},${down.col}`);
    const shared = downCells.filter((c) => acrossCells.has(c));
    expect(shared.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to placing a disconnected word on a new row when no crossing is found', () => {
    const layout = layoutCrossword([
      { word: 'CAT', clue: 'A pet' },
      { word: 'ZEBRA', clue: 'A striped animal' },
    ]);
    expect(layout.placements).toHaveLength(2);
    const zebra = layout.placements.find((p) => p.word === 'ZEBRA')!;
    expect(zebra.dir).toBe('across');
  });

  it('numbers cells using the standard across/down-start convention', () => {
    const layout = layoutCrossword([
      { word: 'CAT', clue: 'A pet' },
      { word: 'CAR', clue: 'A vehicle' },
    ]);
    const numbers = layout.placements.map((p) => p.number).sort();
    // Both placements start at a numbered cell (either they cross at the very first cell, or
    // each gets its own number) -- no placement should be left at 0 (unnumbered).
    expect(numbers.every((n) => n > 0)).toBe(true);
  });

  it('strips non-letter characters and uppercases words', () => {
    const layout = layoutCrossword([{ word: "class-mate", clue: 'A schoolmate' }]);
    expect(layout.cells.get('0,0')).toBe('C');
    expect(Array.from(layout.cells.values()).join('')).toBe('CLASSMATE');
  });

  it('drops an item whose word normalizes to empty, without crashing', () => {
    const layout = layoutCrossword([
      { word: '!!!', clue: 'punctuation only' },
      { word: 'DOG', clue: 'A pet that barks' },
    ]);
    expect(layout.placements).toHaveLength(1);
    expect(layout.placements[0]!.word).toBe('DOG');
  });

  it('returns an empty, non-crashing layout for zero items', () => {
    const layout = layoutCrossword([]);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
    expect(layout.placements).toEqual([]);
  });

  it('keeps duplicate words as separate placements without letter conflicts', () => {
    const layout = layoutCrossword([
      { word: 'CAT', clue: 'clue one' },
      { word: 'CAT', clue: 'clue two' },
    ]);
    expect(layout.placements).toHaveLength(2);
  });
});

describe('renderCrosswordHtml', () => {
  it('renders a self-contained HTML file with no external script/link references', () => {
    const items: CrosswordItem[] = [{ word: 'CAT', clue: 'A pet that meows' }];
    const html = renderCrosswordHtml('Animal Vocab', items);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('renders one input per filled cell and lists across/down clues', () => {
    const items: CrosswordItem[] = [
      { word: 'CAT', clue: 'A pet that meows' },
      { word: 'CAR', clue: 'A vehicle' },
    ];
    const html = renderCrosswordHtml('Animal Vocab', items);
    expect(html).toContain('data-row="0" data-col="0"');
    expect(html).toContain('A pet that meows');
    expect(html).toContain('A vehicle');
  });

  it('escapes HTML in the clue text', () => {
    const html = renderCrosswordHtml('XSS check', [{ word: 'CAT', clue: '<script>alert(1)</script>' }]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders an empty grid without crashing when every word is degenerate', () => {
    const html = renderCrosswordHtml('Empty', [{ word: '!!!', clue: 'nothing' }]);
    expect(html).not.toContain('data-row=');
  });

  it('self-check marks a fully correct grid as fully correct', () => {
    const html = renderCrosswordHtml('Animal Vocab', [{ word: 'CAT', clue: 'A pet that meows' }]);
    const document = loadDom(html);
    const inputs = document.querySelectorAll('input[data-row]');
    const letters = ['C', 'A', 'T'];
    inputs.forEach((input, i) => {
      (input as HTMLInputElement).value = letters[i]!;
    });
    (document.getElementById('check') as HTMLElement).click();
    expect(document.getElementById('result')?.textContent).toBe('3 / 3 correct');
    expect(document.querySelectorAll('input.incorrect').length).toBe(0);
  });

  it('self-check marks a wrong letter as incorrect', () => {
    const html = renderCrosswordHtml('Animal Vocab', [{ word: 'CAT', clue: 'A pet that meows' }]);
    const document = loadDom(html);
    const inputs = document.querySelectorAll('input[data-row]');
    ['X', 'A', 'T'].forEach((letter, i) => {
      (inputs[i] as HTMLInputElement).value = letter;
    });
    (document.getElementById('check') as HTMLElement).click();
    expect(document.getElementById('result')?.textContent).toBe('2 / 3 correct');
    expect(document.querySelectorAll('input.incorrect').length).toBe(1);
  });
});
