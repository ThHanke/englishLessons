export interface CrosswordItem {
  word: string;
  clue: string;
}

interface Placement {
  word: string;
  clue: string;
  row: number;
  col: number;
  dir: 'across' | 'down';
  number: number;
}

export interface CrosswordLayout {
  width: number;
  height: number;
  /** `"row,col"` -> solution letter, for every filled cell in the grid. */
  cells: Map<string, string>;
  placements: Placement[];
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function cellAt(cells: Map<string, string>, row: number, col: number): string | undefined {
  return cells.get(cellKey(row, col));
}

/**
 * Checks whether `word` can be placed at (row, col) in `dir` without conflicting with letters
 * already on the grid, and without touching end-to-end onto an unrelated word (the cell
 * immediately before the start and immediately after the end, in the word's own direction, must
 * be empty). Perpendicular-neighbor collisions (a placement that would make two parallel words
 * silently merge along an edge) are NOT checked -- a known, accepted limitation for this
 * hand-rolled generator (the exercise sets here are short enough that this rarely bites, and a
 * full constraint solver is out of scope for a "cheap vanilla TS" widget).
 */
function canPlace(cells: Map<string, string>, word: string, row: number, col: number, dir: 'across' | 'down'): boolean {
  const dRow = dir === 'down' ? 1 : 0;
  const dCol = dir === 'across' ? 1 : 0;

  const beforeRow = row - dRow;
  const beforeCol = col - dCol;
  if (cellAt(cells, beforeRow, beforeCol) !== undefined) return false;
  const afterRow = row + dRow * word.length;
  const afterCol = col + dCol * word.length;
  if (cellAt(cells, afterRow, afterCol) !== undefined) return false;

  for (let i = 0; i < word.length; i++) {
    const r = row + dRow * i;
    const c = col + dCol * i;
    const existing = cellAt(cells, r, c);
    if (existing !== undefined && existing !== word[i]) return false;
  }
  return true;
}

function place(cells: Map<string, string>, word: string, row: number, col: number, dir: 'across' | 'down'): void {
  const dRow = dir === 'down' ? 1 : 0;
  const dCol = dir === 'across' ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    cells.set(cellKey(row + dRow * i, col + dCol * i), word[i]!);
  }
}

/**
 * Deterministic greedy layout: normalizes each word to A-Z only (drops spaces/punctuation, e.g.
 * for a two-word vocab item), places the longest word first at the origin, then places every
 * following word (longest-first, ties broken by original order) at the first valid crossing it
 * finds against an already-placed word -- or, when no crossing validates, on a fresh row below
 * the current grid so no word is ever dropped. Numbering follows the standard crossword
 * convention: scan cells in row-major order; a cell starts a numbered entry if it begins an
 * across and/or down word.
 */
export function layoutCrossword(items: CrosswordItem[]): CrosswordLayout {
  const normalized = items
    .map((item) => ({ word: item.word.toUpperCase().replace(/[^A-Z]/g, ''), clue: item.clue }))
    .filter((item) => item.word.length > 0);

  const order = normalized
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.word.length - a.item.word.length || a.index - b.index);

  const cells = new Map<string, string>();
  const placements: Placement[] = [];
  let maxRowUsed = -1;

  for (const { item } of order) {
    const { word, clue } = item;
    let placed = false;

    for (const existing of placements) {
      if (placed) break;
      for (let i = 0; i < word.length && !placed; i++) {
        for (let j = 0; j < existing.word.length && !placed; j++) {
          if (word[i] !== existing.word[j]) continue;
          const crossRow = existing.dir === 'down' ? existing.row + j : existing.row;
          const crossCol = existing.dir === 'across' ? existing.col + j : existing.col;
          const newDir: 'across' | 'down' = existing.dir === 'across' ? 'down' : 'across';
          const row = newDir === 'down' ? crossRow - i : crossRow;
          const col = newDir === 'across' ? crossCol - i : crossCol;
          if (canPlace(cells, word, row, col, newDir)) {
            place(cells, word, row, col, newDir);
            placements.push({ word, clue, row, col, dir: newDir, number: 0 });
            maxRowUsed = Math.max(maxRowUsed, row + (newDir === 'down' ? word.length - 1 : 0));
            placed = true;
          }
        }
      }
    }

    if (!placed) {
      const row = maxRowUsed + 2;
      place(cells, word, row, 0, 'across');
      placements.push({ word, clue, row, col: 0, dir: 'across', number: 0 });
      maxRowUsed = row;
    }
  }

  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;
  for (const key of cells.keys()) {
    const [r, c] = key.split(',').map(Number) as [number, number];
    minRow = Math.min(minRow, r);
    minCol = Math.min(minCol, c);
    maxRow = Math.max(maxRow, r);
    maxCol = Math.max(maxCol, c);
  }
  if (!cells.size) {
    return { width: 0, height: 0, cells, placements: [] };
  }

  const shiftedCells = new Map<string, string>();
  for (const [key, letter] of cells) {
    const [r, c] = key.split(',').map(Number) as [number, number];
    shiftedCells.set(cellKey(r - minRow, c - minCol), letter);
  }
  for (const p of placements) {
    p.row -= minRow;
    p.col -= minCol;
  }

  const width = maxCol - minCol + 1;
  const height = maxRow - minRow + 1;

  let nextNumber = 1;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (cellAt(shiftedCells, r, c) === undefined) continue;
      const startsAcross =
        cellAt(shiftedCells, r, c - 1) === undefined && cellAt(shiftedCells, r, c + 1) !== undefined;
      const startsDown =
        cellAt(shiftedCells, r - 1, c) === undefined && cellAt(shiftedCells, r + 1, c) !== undefined;
      if (!startsAcross && !startsDown) continue;
      const number = nextNumber++;
      for (const p of placements) {
        if (p.row === r && p.col === c) p.number = number;
      }
    }
  }

  return { width, height, cells: shiftedCells, placements };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline) with a browser-side self-check, following the other widgets' pattern. A blank
 * `items` list (or one where every word normalizes to empty) renders an empty grid, not a
 * crash, matching gapFill.ts's degenerate-input convention.
 */
export function renderCrosswordHtml(title: string, items: CrosswordItem[]): string {
  const layout = layoutCrossword(items);

  const gridCells: string[] = [];
  for (let r = 0; r < layout.height; r++) {
    for (let c = 0; c < layout.width; c++) {
      const letter = cellAt(layout.cells, r, c);
      if (letter === undefined) {
        gridCells.push(`<div class="cell blocked"></div>`);
        continue;
      }
      const number = layout.placements.find((p) => p.row === r && p.col === c)?.number;
      const numberHtml = number ? `<span class="cell-number">${number}</span>` : '';
      gridCells.push(
        `<div class="cell filled">${numberHtml}<input type="text" maxlength="1" data-row="${r}" data-col="${c}" autocomplete="off"></div>`,
      );
    }
  }

  const across = layout.placements.filter((p) => p.dir === 'across').sort((a, b) => a.number - b.number);
  const down = layout.placements.filter((p) => p.dir === 'down').sort((a, b) => a.number - b.number);
  const clueList = (placements: Placement[]) =>
    placements.map((p) => `<li>${p.number}. ${escapeHtml(p.clue)}</li>`).join('\n');

  const solutionEntries: Array<[string, string]> = [];
  for (const [key, letter] of layout.cells) solutionEntries.push([key, letter]);
  const solutionJson = JSON.stringify(Object.fromEntries(solutionEntries));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
  .grid { display: grid; grid-template-columns: repeat(${Math.max(layout.width, 1)}, 2rem); gap: 1px; margin-bottom: 1.5rem; }
  .cell { position: relative; width: 2rem; height: 2rem; }
  .cell.blocked { background: transparent; }
  .cell.filled input { width: 100%; height: 100%; box-sizing: border-box; text-align: center; text-transform: uppercase;
    border: 1px solid #888; padding: 0; font-size: 1rem; }
  .cell.filled input.correct { background: #d4f7d4; border-color: #2a2; }
  .cell.filled input.incorrect { background: #f7d4d4; border-color: #a22; }
  .cell-number { position: absolute; top: 0; left: 2px; font-size: 0.6rem; color: #444; pointer-events: none; }
  .clues { display: flex; gap: 2rem; }
  .clues ul { padding-left: 1.2rem; }
  button { margin-top: 1rem; }
  p#result { font-weight: bold; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="grid">${gridCells.join('')}</div>
<div class="clues">
  <div><h2>Across</h2><ul>${clueList(across)}</ul></div>
  <div><h2>Down</h2><ul>${clueList(down)}</ul></div>
</div>
<button type="button" id="check">Check</button>
<p id="result"></p>
<script>
(function () {
  var solution = ${solutionJson};
  document.getElementById('check').addEventListener('click', function () {
    var inputs = document.querySelectorAll('input[data-row]');
    var correctCount = 0;
    inputs.forEach(function (input) {
      var key = input.getAttribute('data-row') + ',' + input.getAttribute('data-col');
      var value = input.value.trim().toUpperCase();
      input.classList.remove('correct', 'incorrect');
      if (value.length === 0) return;
      if (value === solution[key]) {
        input.classList.add('correct');
        correctCount++;
      } else {
        input.classList.add('incorrect');
      }
    });
    document.getElementById('result').textContent = correctCount + ' / ' + inputs.length + ' correct';
  });
})();
</script>
</body>
</html>
`;
}
