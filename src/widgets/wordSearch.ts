export interface WordSearchItem {
  word: string;
}

type Direction = 'across' | 'down';

interface PlacedWord {
  word: string;
  row: number;
  col: number;
  dir: Direction;
}

export interface WordSearchLayout {
  width: number;
  height: number;
  /** `"row,col"` -> letter, for every cell -- unlike crossword's cells map (word letters only,
   * with blocked cells around them), word search has no blocked cells: the whole rectangle is
   * filled, word letters plus random filler letters. */
  grid: Map<string, string>;
  placements: PlacedWord[];
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** Deterministic PRNG (mulberry32), matching matching.ts/crossword.ts's convention. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canPlace(cells: Map<string, string>, word: string, row: number, col: number, dir: Direction): boolean {
  const dRow = dir === 'down' ? 1 : 0;
  const dCol = dir === 'across' ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    const existing = cells.get(cellKey(row + dRow * i, col + dCol * i));
    if (existing !== undefined && existing !== word[i]) return false;
  }
  return true;
}

function place(cells: Map<string, string>, word: string, row: number, col: number, dir: Direction): void {
  const dRow = dir === 'down' ? 1 : 0;
  const dCol = dir === 'across' ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    cells.set(cellKey(row + dRow * i, col + dCol * i), word[i]!);
  }
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Deterministic random layout: normalizes each word to A-Z only, sizes a square grid from the
 * total letter count, then places each word at a random row/col in a random direction
 * (across/down only -- no diagonals, matching crossword.ts's own scope-limiting precedent),
 * retrying up to 300 times per word so words that share letters can still cross. A word that
 * can't find a valid random spot within that budget (only realistic for a very dense set of long
 * words) gets a guaranteed fallback row appended below the grid, so -- like crossword.ts -- no
 * word is ever silently dropped. Every remaining empty cell is filled with a random letter
 * (seeded, so decoys are deterministic too) so the target words don't visually stand out.
 */
export function layoutWordSearch(items: WordSearchItem[], seed = 0): WordSearchLayout {
  const words = items
    .map((item) => item.word.toUpperCase().replace(/[^A-Z]/g, ''))
    .filter((w) => w.length > 0);

  const cells = new Map<string, string>();
  const placements: PlacedWord[] = [];
  if (words.length === 0) return { width: 0, height: 0, grid: cells, placements };

  const rand = mulberry32(seed);
  const maxLen = words.reduce((m, w) => Math.max(m, w.length), 1);
  const totalLetters = words.reduce((s, w) => s + w.length, 0);
  const size = Math.max(maxLen, Math.ceil(Math.sqrt(totalLetters * 2)));
  const width = size;
  let height = size;
  const dirs: Direction[] = ['across', 'down'];

  for (const word of words) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const dir = dirs[Math.floor(rand() * dirs.length)]!;
      const maxRow = dir === 'down' ? height - word.length : height - 1;
      const maxCol = dir === 'across' ? width - word.length : width - 1;
      if (maxRow < 0 || maxCol < 0) continue;
      const row = Math.floor(rand() * (maxRow + 1));
      const col = Math.floor(rand() * (maxCol + 1));
      if (canPlace(cells, word, row, col, dir)) {
        place(cells, word, row, col, dir);
        placements.push({ word, row, col, dir });
        placed = true;
      }
    }
    if (!placed) {
      const row = height;
      height += 1;
      place(cells, word, row, 0, 'across');
      placements.push({ word, row, col: 0, dir: 'across' });
    }
  }

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!cells.has(cellKey(r, c))) {
        cells.set(cellKey(r, c), LETTERS[Math.floor(rand() * LETTERS.length)]!);
      }
    }
  }

  return { width, height, grid: cells, placements };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline) with a browser-side self-check, following matching.ts's click-based (not
 * drag-and-drop) interaction convention: click a start cell, then an end cell in the same row or
 * column; the letters between them (checked both forward and reversed, since either click order
 * should count) are compared against every not-yet-found word.
 */
export function renderWordSearchHtml(title: string, items: WordSearchItem[], seed = 0): string {
  const layout = layoutWordSearch(items, seed);

  const gridCells: string[] = [];
  for (let r = 0; r < layout.height; r++) {
    for (let c = 0; c < layout.width; c++) {
      const letter = layout.grid.get(cellKey(r, c)) ?? '';
      gridCells.push(
        `<button type="button" class="cell" data-row="${r}" data-col="${c}">${escapeHtml(letter)}</button>`,
      );
    }
  }

  const wordListHtml = layout.placements
    .map((p) => `<li data-word="${escapeHtml(p.word)}">${escapeHtml(p.word)}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; color: #111; }
  .layout { display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap; }
  .grid { display: grid; grid-template-columns: repeat(${Math.max(layout.width, 1)}, 1.8rem); gap: 1px; }
  .cell { width: 1.8rem; height: 1.8rem; font: inherit; font-weight: bold; text-transform: uppercase;
    border: 1px solid #ccc; background: #fff; cursor: pointer; padding: 0; }
  .cell.selecting { background: #eef4ff; border-color: #06c; }
  .cell.found { background: #d4f7d4; border-color: #2a2; }
  ul.words { list-style: none; padding: 0; }
  ul.words li { text-transform: uppercase; padding: 0.15rem 0; }
  ul.words li.found { text-decoration: line-through; color: #2a2; }
  p#result { font-weight: bold; margin-top: 1rem; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>Click a letter to start, then click another letter in the same row or column to select a word.</p>
<div class="layout">
  <div class="grid">${gridCells.join('')}</div>
  <div>
    <h2>Find these words</h2>
    <ul class="words">${wordListHtml}</ul>
  </div>
</div>
<p id="result"></p>
<script>
(function () {
  var width = ${layout.width};
  var found = {};
  var total = ${layout.placements.length};
  var start = null;

  function cellAt(r, c) {
    return document.querySelector('.cell[data-row="' + r + '"][data-col="' + c + '"]');
  }

  function clearSelecting() {
    document.querySelectorAll('.cell.selecting').forEach(function (el) { el.classList.remove('selecting'); });
  }

  function updateResult() {
    var count = Object.keys(found).length;
    document.getElementById('result').textContent = count + ' / ' + total + ' words found';
  }

  document.querySelectorAll('.cell').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = Number(btn.getAttribute('data-row'));
      var col = Number(btn.getAttribute('data-col'));
      if (start === null) {
        start = { row: row, col: col };
        btn.classList.add('selecting');
        return;
      }
      var end = { row: row, col: col };
      var line = [];
      if (start.row === end.row) {
        var lo = Math.min(start.col, end.col), hi = Math.max(start.col, end.col);
        for (var c = lo; c <= hi; c++) line.push(cellAt(start.row, c));
      } else if (start.col === end.col) {
        var lo2 = Math.min(start.row, end.row), hi2 = Math.max(start.row, end.row);
        for (var r = lo2; r <= hi2; r++) line.push(cellAt(r, start.col));
      }
      clearSelecting();
      start = null;
      if (line.length === 0) return;
      var text = line.map(function (el) { return el.textContent; }).join('');
      var reversed = text.split('').reverse().join('');
      document.querySelectorAll('ul.words li').forEach(function (li) {
        var word = li.getAttribute('data-word');
        if (found[word]) return;
        if (word === text || word === reversed) {
          found[word] = true;
          li.classList.add('found');
          line.forEach(function (el) { el.classList.add('found'); });
          updateResult();
        }
      });
    });
  });

  updateResult();
})();
</script>
</body>
</html>
`;
}
