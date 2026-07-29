export interface MatchingPair {
  left: string;
  right: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Deterministic PRNG (mulberry32) so a given seed always produces the same shuffle - tests aren't flaky. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle of [0..n) using a seeded PRNG. Returns the shuffled array of original indices. */
function shuffledIndices(n: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline) with a browser-side self-check. There is no drag-and-drop library: this uses a
 * click-to-select-then-click-to-pair interaction so it is fully keyboard-operable (native
 * <button> elements) and degrades to a printable static page without JS (both columns are
 * plain lists). Pairing is keyed off each pair's original index, not its text, so duplicate
 * `left`/`right` values never collide. `seed` controls the shuffle of the right-hand column
 * so output (and tests) are deterministic.
 */
export function renderMatchingHtml(title: string, pairs: MatchingPair[], seed = 0): string {
  const n = pairs.length;
  const rightOrder = shuffledIndices(n, seed);

  const leftHtml = pairs
    .map(
      (pair, i) => `
      <button type="button" class="item left available" data-left="${i}">${escapeHtml(pair.left)}</button>`
    )
    .join('');

  const rightHtml = rightOrder
    .map(
      (originalIndex) => `
      <button type="button" class="item right available" data-right="${originalIndex}">${escapeHtml(pairs[originalIndex]!.right)}</button>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; color: #111; }
  .columns { display: flex; gap: 2rem; }
  .column { flex: 1; display: flex; flex-direction: column; gap: 0.4rem; }
  .item { display: block; width: 100%; text-align: left; border: 1px solid #888; border-radius: 0.3rem;
    padding: 0.5rem 0.7rem; background: #fff; cursor: pointer; font: inherit; }
  .item:focus { outline: 2px solid #06c; }
  .item.selected { background: #eef4ff; border-color: #06c; }
  .item.paired { background: #f0f0f0; border-color: #666; }
  .item.correct { background: #d4f7d4; border-color: #2a2; }
  .item.incorrect { background: #f7d4d4; border-color: #a22; }
  button#check { margin-top: 1.2rem; }
  p#result { font-weight: bold; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>Select an item on the left, then select its match on the right. Select a paired item again to undo it.</p>
<div class="columns">
  <div class="column" id="left-column">${leftHtml}</div>
  <div class="column" id="right-column">${rightHtml}</div>
</div>
<button type="button" id="check">Check</button>
<p id="result"></p>
<script>
(function () {
  var n = ${n};
  var pairing = new Array(n).fill(null); // pairing[leftIndex] = rightOriginalIndex or null
  var pendingLeft = null;

  function findLeft(i) { return document.querySelector('.item.left[data-left="' + i + '"]'); }
  function findRight(i) { return document.querySelector('.item.right[data-right="' + i + '"]'); }

  function clearPending() {
    if (pendingLeft !== null) {
      var el = findLeft(pendingLeft);
      if (el) {
        el.classList.remove('selected');
        el.classList.add('available');
      }
    }
    pendingLeft = null;
  }

  document.querySelectorAll('.item.left').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = Number(btn.getAttribute('data-left'));
      if (pairing[i] !== null) {
        var r = pairing[i];
        pairing[i] = null;
        btn.classList.remove('paired', 'correct', 'incorrect');
        btn.classList.add('available');
        var rBtn = findRight(r);
        if (rBtn) {
          rBtn.classList.remove('paired', 'correct', 'incorrect');
          rBtn.classList.add('available');
        }
        return;
      }
      if (pendingLeft === i) {
        clearPending();
        return;
      }
      clearPending();
      pendingLeft = i;
      btn.classList.remove('available');
      btn.classList.add('selected');
    });
  });

  document.querySelectorAll('.item.right').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var r = Number(btn.getAttribute('data-right'));
      for (var k = 0; k < n; k++) {
        if (pairing[k] === r) return; // already paired, click a left item to undo it
      }
      if (pendingLeft === null) return;
      pairing[pendingLeft] = r;
      var lBtn = findLeft(pendingLeft);
      if (lBtn) {
        lBtn.classList.remove('selected');
        lBtn.classList.add('paired');
      }
      btn.classList.remove('available');
      btn.classList.add('paired');
      pendingLeft = null;
    });
  });

  document.getElementById('check').addEventListener('click', function () {
    var correctCount = 0;
    for (var i = 0; i < n; i++) {
      var lBtn = findLeft(i);
      var r = pairing[i];
      lBtn.classList.remove('correct', 'incorrect');
      if (r === null) continue;
      var rBtn = findRight(r);
      rBtn.classList.remove('correct', 'incorrect');
      if (r === i) {
        lBtn.classList.add('correct');
        rBtn.classList.add('correct');
        correctCount++;
      } else {
        lBtn.classList.add('incorrect');
        rBtn.classList.add('incorrect');
      }
    }
    document.getElementById('result').textContent = correctCount + ' / ' + n + ' correct';
  });
})();
</script>
</body>
</html>
`;
}
