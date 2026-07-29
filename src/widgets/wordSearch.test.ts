import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { layoutWordSearch, renderWordSearchHtml, type WordSearchItem } from './wordSearch.ts';

function loadDom(html: string) {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  return dom.window.document;
}

describe('layoutWordSearch', () => {
  it('returns an empty, non-crashing layout for zero items', () => {
    const layout = layoutWordSearch([]);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
    expect(layout.placements).toEqual([]);
  });

  it('places every word without dropping any, even a dense set that needs the fallback row', () => {
    const items: WordSearchItem[] = Array.from({ length: 15 }, (_, i) => ({
      word: `WORD${i}ABCDEFGHIJ`,
    }));
    const layout = layoutWordSearch(items, 3);
    expect(layout.placements).toHaveLength(items.length);
  });

  it('fills every cell in the bounding box (no holes) with a letter', () => {
    const layout = layoutWordSearch([{ word: 'CAT' }, { word: 'DOG' }], 1);
    for (let r = 0; r < layout.height; r++) {
      for (let c = 0; c < layout.width; c++) {
        expect(layout.grid.get(`${r},${c}`)).toMatch(/^[A-Z]$/);
      }
    }
  });

  it('places each word letters consistently along its own row (across) or column (down)', () => {
    const layout = layoutWordSearch([{ word: 'CAT' }, { word: 'DOG' }], 1);
    for (const p of layout.placements) {
      for (let i = 0; i < p.word.length; i++) {
        const r = p.dir === 'down' ? p.row + i : p.row;
        const c = p.dir === 'across' ? p.col + i : p.col;
        expect(layout.grid.get(`${r},${c}`)).toBe(p.word[i]);
      }
    }
  });

  it('strips non-letter characters and uppercases words', () => {
    const layout = layoutWordSearch([{ word: 'class-mate' }], 0);
    const placed = layout.placements[0]!;
    expect(placed.word).toBe('CLASSMATE');
  });

  it('drops an item whose word normalizes to empty, without crashing', () => {
    const layout = layoutWordSearch([{ word: '!!!' }, { word: 'DOG' }], 0);
    expect(layout.placements).toHaveLength(1);
    expect(layout.placements[0]!.word).toBe('DOG');
  });

  it('produces the same layout for the same seed every time (not flaky)', () => {
    const items: WordSearchItem[] = [{ word: 'CAT' }, { word: 'DOG' }, { word: 'BIRD' }];
    const layoutA = layoutWordSearch(items, 7);
    const layoutB = layoutWordSearch(items, 7);
    expect(Array.from(layoutA.grid.entries())).toEqual(Array.from(layoutB.grid.entries()));
    expect(layoutA.placements).toEqual(layoutB.placements);
  });
});

describe('renderWordSearchHtml', () => {
  const items: WordSearchItem[] = [{ word: 'CAT' }, { word: 'DOG' }];

  it('is a self-contained HTML file with no external script/link references', () => {
    const html = renderWordSearchHtml('Animal Words', items, 1);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('escapes HTML in the word list (defense in depth, even though words are letters-only)', () => {
    const html = renderWordSearchHtml('XSS check', [{ word: '<script>x</script>' }], 0);
    expect(html).not.toContain('<script>x</script>');
  });

  it('lists every placed word in the sidebar list', () => {
    const html = renderWordSearchHtml('Animal Words', items, 1);
    const document = loadDom(html);
    const listed = Array.from(document.querySelectorAll('ul.words li')).map((li) =>
      li.getAttribute('data-word'),
    );
    expect(listed.sort()).toEqual(['CAT', 'DOG']);
  });

  it('finds a word when its two end cells are clicked, and marks it found', () => {
    const html = renderWordSearchHtml('Animal Words', items, 1);
    const document = loadDom(html);
    const layout = layoutWordSearch(items, 1);
    const cat = layout.placements.find((p) => p.word === 'CAT')!;
    const dRow = cat.dir === 'down' ? 1 : 0;
    const dCol = cat.dir === 'across' ? 1 : 0;
    const startCell = document.querySelector(
      `.cell[data-row="${cat.row}"][data-col="${cat.col}"]`,
    ) as HTMLElement;
    const endRow = cat.row + dRow * (cat.word.length - 1);
    const endCol = cat.col + dCol * (cat.word.length - 1);
    const endCell = document.querySelector(
      `.cell[data-row="${endRow}"][data-col="${endCol}"]`,
    ) as HTMLElement;

    startCell.click();
    endCell.click();

    expect(document.querySelector('li[data-word="CAT"]')?.classList.contains('found')).toBe(true);
    expect(document.getElementById('result')?.textContent).toBe('1 / 2 words found');
  });

  it('does not count a click on two cells that are not in the same row or column', () => {
    const html = renderWordSearchHtml('Animal Words', items, 1);
    const document = loadDom(html);
    const cells = document.querySelectorAll('.cell');
    const first = cells[0] as HTMLElement;
    // Pick a cell guaranteed off both first's row and column when the grid is at least 2x2.
    const layout = layoutWordSearch(items, 1);
    let other: HTMLElement | null = null;
    for (const cell of Array.from(cells)) {
      const r = (cell as HTMLElement).getAttribute('data-row');
      const c = (cell as HTMLElement).getAttribute('data-col');
      if (r !== '0' && c !== '0') {
        other = cell as HTMLElement;
        break;
      }
    }
    if (layout.width > 1 && layout.height > 1 && other) {
      first.click();
      other.click();
      expect(document.getElementById('result')?.textContent).toBe('0 / 2 words found');
    }
  });
});
