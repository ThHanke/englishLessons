export interface ReorderItem {
  /** Fragments (words, sentences, or paragraph lines) in their CORRECT final order -- rendered
   * scrambled, the pupil reorders them back into this order. */
  fragments: string[];
  /** Optional instruction shown above the fragments, e.g. "Put the story events in order." */
  instruction?: string;
}

export type CheckResult = 'correct' | 'incorrect' | 'unanswered';

/** Deterministic PRNG (mulberry32), matching matching.ts's convention -- shuffled scramble order
 * (and tests) are reproducible from a seed. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle of [0..n) using a seeded PRNG, re-shuffling once if it happens to land on
 * the already-correct order (n > 1) so the pupil always has actual reordering to do. */
function shuffledIndices(n: number, seed: number): number[] {
  const rand = mulberry32(seed);
  function once(): number[] {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
  let order = once();
  if (n > 1 && order.every((v, i) => v === i)) order = once();
  return order;
}

/** Checks a candidate ordering (array of original fragment indices, in display order) against
 * the correct order [0, 1, ..., n-1] -- exported so a test/checker can validate independently of
 * the rendered widget's own click-tracked state. */
export function checkOrder(candidateIndices: number[], fragmentCount: number): CheckResult {
  if (candidateIndices.length !== fragmentCount) return 'unanswered';
  return candidateIndices.every((v, i) => v === i) ? 'correct' : 'incorrect';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline) with a browser-side self-check, following matching.ts's click-based (not drag-and-drop)
 * interaction convention -- Up/Down buttons per row, fully keyboard-operable and printable.
 * `seed` controls the scramble so output (and tests) are deterministic.
 */
export function renderReorderHtml(title: string, items: ReorderItem[], seed = 0): string {
  const itemsHtml = items
    .map((item, ii) => {
      const order = shuffledIndices(item.fragments.length, seed + ii);
      const rowsHtml = order
        .map(
          (originalIndex, pos) => `
        <li class="fragment" data-item="${ii}" data-pos="${pos}" data-original="${originalIndex}">
          <span class="text">${escapeHtml(item.fragments[originalIndex]!)}</span>
          <span class="controls">
            <button type="button" class="up" data-item="${ii}" data-pos="${pos}" aria-label="Move up">&uarr;</button>
            <button type="button" class="down" data-item="${ii}" data-pos="${pos}" aria-label="Move down">&darr;</button>
          </span>
        </li>`,
        )
        .join('');
      const instructionHtml = item.instruction
        ? `<p class="instruction">${escapeHtml(item.instruction)}</p>`
        : '';
      return `
    <div class="item" data-item="${ii}">
      ${instructionHtml}
      <ol class="fragments" data-item="${ii}">${rowsHtml}</ol>
      <button type="button" class="check" data-item="${ii}">Check</button>
      <p class="result" data-result="${ii}"></p>
    </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; color: #111; }
  .item { border: 1px solid #ccc; border-radius: 0.4rem; margin-bottom: 1.5rem; padding: 1rem; }
  .instruction { font-style: italic; color: #444; }
  ol.fragments { list-style: decimal; padding-left: 1.5rem; }
  li.fragment { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    border: 1px solid #ddd; border-radius: 0.3rem; padding: 0.4rem 0.6rem; margin-bottom: 0.3rem; background: #fff; }
  li.fragment.correct { background: #d4f7d4; border-color: #2a2; }
  li.fragment.incorrect { background: #f7d4d4; border-color: #a22; }
  .controls button { font: inherit; cursor: pointer; border: 1px solid #888; border-radius: 0.3rem; background: #fff;
    width: 1.8rem; height: 1.8rem; }
  .controls button:disabled { opacity: 0.3; cursor: default; }
  button.check { margin-top: 0.6rem; }
  p.result { font-weight: bold; min-height: 1.2em; }
  p.result.correct { color: #2a2; }
  p.result.incorrect { color: #a22; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${itemsHtml}
<script>
(function () {
  function currentOrder(ii) {
    var lis = document.querySelectorAll('ol.fragments[data-item="' + ii + '"] > li');
    var order = [];
    lis.forEach(function (li) { order.push(Number(li.getAttribute('data-original'))); });
    return order;
  }

  function renumber(ii) {
    var list = document.querySelector('ol.fragments[data-item="' + ii + '"]');
    var lis = Array.prototype.slice.call(list.children);
    lis.forEach(function (li, pos) {
      li.setAttribute('data-pos', pos);
      li.querySelector('button.up').setAttribute('data-pos', pos);
      li.querySelector('button.down').setAttribute('data-pos', pos);
      li.querySelector('button.up').disabled = pos === 0;
      li.querySelector('button.down').disabled = pos === lis.length - 1;
      li.classList.remove('correct', 'incorrect');
    });
  }

  document.querySelectorAll('ol.fragments').forEach(function (list) {
    renumber(list.getAttribute('data-item'));
  });

  document.body.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button.up, button.down');
    if (!btn) return;
    var ii = btn.getAttribute('data-item');
    var pos = Number(btn.getAttribute('data-pos'));
    var list = document.querySelector('ol.fragments[data-item="' + ii + '"]');
    var lis = list.children;
    var target = btn.classList.contains('up') ? pos - 1 : pos + 1;
    if (target < 0 || target >= lis.length) return;
    if (target < pos) {
      list.insertBefore(lis[pos], lis[target]);
    } else {
      list.insertBefore(lis[target], lis[pos]);
    }
    renumber(ii);
  });

  document.querySelectorAll('button.check').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var ii = btn.getAttribute('data-item');
      var order = currentOrder(ii);
      var lis = document.querySelectorAll('ol.fragments[data-item="' + ii + '"] > li');
      var allCorrect = true;
      lis.forEach(function (li, pos) {
        li.classList.remove('correct', 'incorrect');
        var isCorrect = Number(li.getAttribute('data-original')) === pos;
        li.classList.add(isCorrect ? 'correct' : 'incorrect');
        if (!isCorrect) allCorrect = false;
      });
      var resultEl = document.querySelector('[data-result="' + ii + '"]');
      resultEl.textContent = allCorrect ? 'Correct order!' : 'Not quite -- keep reordering.';
      resultEl.className = 'result ' + (allCorrect ? 'correct' : 'incorrect');
    });
  });
})();
</script>
</body>
</html>
`;
}
