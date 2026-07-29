export interface MarkTheWordsItem {
  /** Passage text; words are split on whitespace for interaction and checking, so `targetIndices`
   * refers to positions in `text.split(/\s+/)`. Punctuation stays attached to its word (what the
   * pupil visually clicks is exactly what gets checked). */
  text: string;
  /** 0-based indices into the whitespace-split `text` of every word the pupil should mark. */
  targetIndices: number[];
  /** Instruction shown above the passage, e.g. "Click every past-tense verb." */
  instruction: string;
}

export type MarkResult = 'hit' | 'miss' | 'false-positive' | 'correct-omission';

/**
 * Per-word verdict once marking is done: a target word that got marked is a `hit`, one that
 * didn't is a `miss`; a non-target word that got marked is a `false-positive`, one that didn't is
 * a `correct-omission` (the expected, unremarkable case -- most words in a passage aren't
 * targets). Exported so a test can validate the scoring independent of the rendered widget.
 */
export function checkWord(index: number, marked: Set<number>, targetIndices: number[]): MarkResult {
  const isTarget = targetIndices.includes(index);
  const isMarked = marked.has(index);
  if (isTarget) return isMarked ? 'hit' : 'miss';
  return isMarked ? 'false-positive' : 'correct-omission';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline) with a browser-side self-check, following the other widgets' pattern. Each word is a
 * clickable button (toggle marked/unmarked); Check colors every word by `checkWord`'s verdict --
 * hits and correct omissions green/neutral, misses and false positives flagged -- so the pupil
 * sees not just a count but exactly which words they missed or over-marked.
 */
export function renderMarkTheWordsHtml(title: string, items: MarkTheWordsItem[]): string {
  const itemsHtml = items
    .map((item, ii) => {
      const words = item.text.split(/\s+/).filter((w) => w.length > 0);
      const wordsHtml = words
        .map(
          (w, wi) =>
            `<button type="button" class="word" data-item="${ii}" data-word="${wi}">${escapeHtml(w)}</button>`,
        )
        .join(' ');
      return `
    <fieldset class="item" data-item="${ii}">
      <legend>${escapeHtml(item.instruction)}</legend>
      <p class="passage" data-item="${ii}">${wordsHtml}</p>
      <button type="button" class="check" data-item="${ii}">Check</button>
      <p class="result" data-result="${ii}"></p>
    </fieldset>`;
    })
    .join('');

  const targetsJson = JSON.stringify(items.map((it) => it.targetIndices));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; color: #111; }
  fieldset.item { border: 1px solid #ccc; border-radius: 0.4rem; margin-bottom: 1.5rem; padding: 1rem; }
  legend { font-weight: bold; padding: 0 0.4rem; }
  p.passage { line-height: 2.4; }
  button.word { font: inherit; cursor: pointer; border: 1px solid transparent; border-radius: 0.25rem;
    background: none; padding: 0.1rem 0.15rem; }
  button.word.marked { background: #eef4ff; border-color: #06c; }
  button.word.hit { background: #d4f7d4; border-color: #2a2; }
  button.word.miss { background: #fff3cd; border-color: #a80; text-decoration: underline dotted; }
  button.word.false-positive { background: #f7d4d4; border-color: #a22; }
  button.check { margin-top: 0.8rem; }
  p.result { font-weight: bold; min-height: 1.2em; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${itemsHtml}
<script>
(function () {
  var targets = ${targetsJson};

  document.querySelectorAll('button.word').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.classList.toggle('marked');
      btn.classList.remove('hit', 'miss', 'false-positive');
    });
  });

  document.querySelectorAll('button.check').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var ii = btn.getAttribute('data-item');
      var itemTargets = targets[ii];
      var words = document.querySelectorAll('.passage[data-item="' + ii + '"] button.word');
      var hits = 0;
      var falsePositives = 0;
      words.forEach(function (w) {
        var wi = Number(w.getAttribute('data-word'));
        var isTarget = itemTargets.indexOf(wi) !== -1;
        var isMarked = w.classList.contains('marked');
        w.classList.remove('hit', 'miss', 'false-positive');
        if (isTarget && isMarked) { w.classList.add('hit'); hits++; }
        else if (isTarget && !isMarked) { w.classList.add('miss'); }
        else if (!isTarget && isMarked) { w.classList.add('false-positive'); falsePositives++; }
      });
      var resultEl = document.querySelector('[data-result="' + ii + '"]');
      resultEl.textContent = hits + ' / ' + itemTargets.length + ' found' +
        (falsePositives > 0 ? ', ' + falsePositives + ' extra word' + (falsePositives > 1 ? 's' : '') + ' marked' : '');
    });
  });
})();
</script>
</body>
</html>
`;
}
