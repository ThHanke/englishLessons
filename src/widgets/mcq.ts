import type { CheckResult } from './gapFill.ts';

export type { CheckResult };

export interface McqItem {
  question: string;
  options: string[];
  correctIndex: number;
}

export function checkAnswer(selectedIndex: number | null, item: McqItem): CheckResult {
  if (selectedIndex === null || selectedIndex === undefined) return 'unanswered';
  return selectedIndex === item.correctIndex ? 'correct' : 'incorrect';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline) with a browser-side self-check. The check logic mirrors checkAnswer above; it's
 * duplicated as plain JS (not imported) because the page runs standalone via `file://` with
 * no build/bundle step (KTD7 - vanilla TS, no framework, no new dependency).
 */
export function renderMcqHtml(title: string, items: McqItem[]): string {
  const questionsHtml = items
    .map((item, qi) => {
      const optionsHtml =
        item.options.length === 0
          ? `<p class="no-options">No options available for this question.</p>`
          : item.options
              .map(
                (opt, oi) => `
      <label class="option" for="q${qi}o${oi}">
        <input type="radio" id="q${qi}o${oi}" name="q${qi}" value="${oi}">
        <span>${escapeHtml(opt)}</span>
      </label>`
              )
              .join('');

      return `
    <fieldset class="question" data-question="${qi}">
      <legend>${escapeHtml(item.question)}</legend>
      <div class="options">${optionsHtml}</div>
      <button type="button" class="check" data-question="${qi}">Check</button>
      <p class="result" data-result="${qi}"></p>
    </fieldset>`;
    })
    .join('');

  const answersJson = JSON.stringify(items.map((it) => it.correctIndex));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; color: #111; }
  fieldset.question { border: 1px solid #ccc; border-radius: 0.4rem; margin-bottom: 1.5rem; padding: 1rem; }
  legend { font-weight: bold; padding: 0 0.4rem; }
  label.option { display: block; padding: 0.3rem 0.2rem; cursor: pointer; }
  label.option:focus-within { outline: 2px solid #06c; }
  label.option.selected { background: #eef4ff; }
  label.option.correct { background: #d4f7d4; }
  label.option.incorrect { background: #f7d4d4; }
  .no-options { font-style: italic; color: #666; }
  button.check { margin-top: 0.6rem; }
  p.result { font-weight: bold; min-height: 1.2em; }
  p.result.correct { color: #2a2; }
  p.result.incorrect { color: #a22; }
  p.result.unanswered { color: #666; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${questionsHtml}
<script>
(function () {
  var answers = ${answersJson};

  document.querySelectorAll('input[type="radio"]').forEach(function (input) {
    input.addEventListener('change', function () {
      var name = input.getAttribute('name');
      document.querySelectorAll('input[name="' + name + '"]').forEach(function (sibling) {
        var label = sibling.closest('label');
        if (label) label.classList.remove('selected', 'correct', 'incorrect');
      });
      var label = input.closest('label');
      if (label) label.classList.add('selected');
    });
  });

  document.querySelectorAll('button.check').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var qi = Number(btn.getAttribute('data-question'));
      var fieldset = document.querySelector('fieldset[data-question="' + qi + '"]');
      var resultEl = document.querySelector('[data-result="' + qi + '"]');
      var selected = fieldset.querySelector('input[name="q' + qi + '"]:checked');
      fieldset.querySelectorAll('label.option').forEach(function (label) {
        label.classList.remove('selected', 'correct', 'incorrect');
      });
      if (!selected) {
        resultEl.textContent = 'Unanswered';
        resultEl.className = 'result unanswered';
        return;
      }
      var idx = Number(selected.value);
      var label = selected.closest('label');
      if (idx === answers[qi]) {
        resultEl.textContent = 'Correct';
        resultEl.className = 'result correct';
        if (label) label.classList.add('correct');
      } else {
        resultEl.textContent = 'Incorrect';
        resultEl.className = 'result incorrect';
        if (label) label.classList.add('incorrect');
      }
    });
  });
})();
</script>
</body>
</html>
`;
}
