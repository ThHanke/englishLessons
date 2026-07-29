export interface Blank {
  answer: string;
  position: number;
  /** Base/prompt form shown next to the blank (e.g. "clean" for answer "is cleaned") -- without
   * this a pupil has no way to know which verb/word is even being asked for, and the exact-match
   * checker below has no tolerance for a different-but-plausible word choice. Optional so existing
   * callers/tests that don't need a hint (e.g. a fill-in-the-noun blank) aren't forced to add one. */
  hint?: string;
}

export interface GapFillItem {
  sentence: string;
  blanks: Blank[];
}

export type CheckResult = 'correct' | 'incorrect' | 'unanswered';

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Case/whitespace-insensitive, matching src/vocab/leveling.ts's normalization convention. */
export function checkBlank(userAnswer: string, blank: Blank): CheckResult {
  const trimmed = userAnswer.trim();
  if (trimmed.length === 0) return 'unanswered';
  return normalize(trimmed) === normalize(blank.answer) ? 'correct' : 'incorrect';
}

export function checkItem(userAnswers: string[], item: GapFillItem): CheckResult[] {
  return item.blanks.map((blank, i) => checkBlank(userAnswers[i] ?? '', blank));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline) with a browser-side self-check. The check logic here mirrors checkBlank/checkItem
 * above; it's duplicated as plain JS (not imported) because the page runs standalone via
 * `file://` with no build/bundle step (KTD7 - vanilla TS, no framework, no new dependency).
 *
 * Accepts multiple items (one worksheet, many sentences) so its shape matches mcq.ts/
 * matching.ts's array-of-items renderers -- generate_exercise dispatches to all three the same
 * way. Blanks are scoped by item index (`data-item`) + blank index (`data-blank`) so multiple
 * sentences' inputs never collide.
 */
export function renderGapFillHtml(title: string, items: GapFillItem[]): string {
  const itemsHtml = items
    .map((item, ii) => {
      const parts = item.sentence.split('___');
      const sentenceHtml = parts
        .map((part, bi) => {
          if (bi >= item.blanks.length) return escapeHtml(part);
          const blank = item.blanks[bi]!;
          const hintHtml = blank.hint ? ` <span class="hint">(${escapeHtml(blank.hint)})</span>` : '';
          return `${escapeHtml(part)}<input type="text" data-item="${ii}" data-blank="${bi}" autocomplete="off">${hintHtml}`;
        })
        .join('');
      return `<p class="sentence" data-item="${ii}">${sentenceHtml}</p>`;
    })
    .join('\n');

  const answersJson = JSON.stringify(items.map((item) => item.blanks.map((b) => b.answer)));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
  input { border: 1px solid #888; padding: 0.2rem 0.4rem; }
  input.correct { background: #d4f7d4; border-color: #2a2; }
  input.incorrect { background: #f7d4d4; border-color: #a22; }
  .hint { color: #666; font-style: italic; }
  button { margin-top: 1rem; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${itemsHtml}
<button id="check">Check</button>
<script>
(function () {
  var answers = ${answersJson};
  function normalize(s) { return s.trim().toLowerCase(); }
  document.getElementById('check').addEventListener('click', function () {
    var inputs = document.querySelectorAll('input[data-item]');
    inputs.forEach(function (input) {
      var ii = Number(input.getAttribute('data-item'));
      var bi = Number(input.getAttribute('data-blank'));
      var value = input.value.trim();
      input.classList.remove('correct', 'incorrect');
      if (value.length === 0) return;
      if (normalize(value) === normalize(answers[ii][bi])) {
        input.classList.add('correct');
      } else {
        input.classList.add('incorrect');
      }
    });
  });
})();
</script>
</body>
</html>
`;
}
