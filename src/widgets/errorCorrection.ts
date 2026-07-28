export interface ErrorCorrectionItem {
  /** The sentence as written, containing exactly one deliberate error (error-correction-design
   * skill's convention). */
  sentence: string;
  /** The fully corrected sentence. */
  correction: string;
  /** Optional error-type hint (e.g. "word order") for A1 scaffolding per the skill's step 3 --
   * shown next to the "find" prompt when present, omitted for A2+ (no hints). */
  errorType?: string;
}

export type CheckResult = 'correct' | 'incorrect' | 'unanswered';

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Case/whitespace-insensitive, matching gapFill.ts's checkBlank convention. Only the "correct"
 * step is auto-checked -- "find" and "explain" are open-ended metalinguistic prompts (find the
 * mistake, explain the rule) that this codebase deliberately never auto-grades as free text
 * (matches the exercise-design-reference's "no fake auto-grading of free text" boundary). */
export function checkCorrection(userAnswer: string, item: ErrorCorrectionItem): CheckResult {
  const trimmed = userAnswer.trim();
  if (trimmed.length === 0) return 'unanswered';
  return normalize(trimmed) === normalize(item.correction) ? 'correct' : 'incorrect';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline) with a browser-side self-check, following gapFill.ts/mcq.ts's pattern. The
 * find -> explain -> correct scaffold (error-correction-design skill): "find" and "explain" are
 * plain text inputs with no correctness class applied (open-ended, not auto-checkable); only
 * "correct" gets an auto self-check against `item.correction`.
 */
export function renderErrorCorrectionHtml(title: string, items: ErrorCorrectionItem[]): string {
  const itemsHtml = items
    .map((item, ii) => {
      const hintHtml = item.errorType
        ? ` <span class="error-type-hint">(hint: ${escapeHtml(item.errorType)})</span>`
        : '';
      return `
    <fieldset class="item" data-item="${ii}">
      <legend>${escapeHtml(item.sentence)}</legend>
      <label>Find the mistake: what word(s) are wrong?${hintHtml}
        <input type="text" data-find="${ii}" autocomplete="off">
      </label>
      <label>Explain: why is this wrong?
        <input type="text" data-explain="${ii}" autocomplete="off">
      </label>
      <label>Correct: write the full corrected sentence.
        <input type="text" data-correct="${ii}" autocomplete="off">
      </label>
      <button type="button" class="check" data-item="${ii}">Check</button>
      <p class="result" data-result="${ii}"></p>
    </fieldset>`;
    })
    .join('');

  const correctionsJson = JSON.stringify(items.map((it) => it.correction));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
  fieldset.item { border: 1px solid #ccc; border-radius: 0.4rem; margin-bottom: 1.5rem; padding: 1rem; }
  legend { font-weight: bold; padding: 0 0.4rem; }
  label { display: block; margin-top: 0.6rem; }
  input[type="text"] { display: block; width: 100%; margin-top: 0.2rem; border: 1px solid #888; padding: 0.3rem 0.5rem; box-sizing: border-box; }
  input.correct { background: #d4f7d4; border-color: #2a2; }
  input.incorrect { background: #f7d4d4; border-color: #a22; }
  .error-type-hint { font-weight: normal; font-style: italic; color: #666; }
  button.check { margin-top: 0.8rem; }
  p.result { font-weight: bold; min-height: 1.2em; }
  p.result.correct { color: #2a2; }
  p.result.incorrect { color: #a22; }
  p.result.unanswered { color: #666; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${itemsHtml}
<script>
(function () {
  var corrections = ${correctionsJson};
  function normalize(s) { return s.trim().toLowerCase().replace(/\\s+/g, ' '); }

  document.querySelectorAll('button.check').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var ii = Number(btn.getAttribute('data-item'));
      var correctInput = document.querySelector('input[data-correct="' + ii + '"]');
      var resultEl = document.querySelector('[data-result="' + ii + '"]');
      var value = correctInput.value.trim();
      correctInput.classList.remove('correct', 'incorrect');
      if (value.length === 0) {
        resultEl.textContent = 'Unanswered';
        resultEl.className = 'result unanswered';
        return;
      }
      if (normalize(value) === normalize(corrections[ii])) {
        resultEl.textContent = 'Correct';
        resultEl.className = 'result correct';
        correctInput.classList.add('correct');
      } else {
        resultEl.textContent = 'Incorrect';
        resultEl.className = 'result incorrect';
        correctInput.classList.add('incorrect');
      }
    });
  });
})();
</script>
</body>
</html>
`;
}
