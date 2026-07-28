export interface VocabWord {
  word: string;
  translation: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline), a pre-teaching glossary of genuinely new vocabulary for a lesson (docs/spec/
 * 03-generation.md §4.2: "unavoidable new words are surfaced as a pre-taught glossary, never
 * silently used"). Each row has a read-aloud button using the browser's native Web Speech API
 * (`speechSynthesis` -- already an established convention for listening exercises in this repo,
 * docs/spec/03-generation.md/04-roadmap.md/06-exercise-design-reference.md); the button is
 * disabled (not hidden) when the browser doesn't support it, so the page still degrades to a
 * printable static glossary either way. An empty `words` list renders a "no new vocabulary" note,
 * not a crash or an empty table.
 */
export function renderVocabIntroHtml(title: string, words: VocabWord[]): string {
  const rowsHtml =
    words.length === 0
      ? `<p class="no-words">No new vocabulary for this lesson.</p>`
      : `<table class="vocab">
<thead><tr><th>Word</th><th>Translation</th><th></th></tr></thead>
<tbody>
${words
  .map(
    (w) => `<tr>
  <td>${escapeHtml(w.word)}</td>
  <td>${escapeHtml(w.translation)}</td>
  <td><button type="button" class="speak" data-word="${escapeHtml(w.word)}" aria-label="Read aloud: ${escapeHtml(w.word)}">&#128266;</button></td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
  table.vocab { border-collapse: collapse; width: 100%; }
  table.vocab th, table.vocab td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  button.speak { border: 1px solid #888; border-radius: 0.3rem; background: #fff; cursor: pointer; font-size: 1rem; }
  button.speak:disabled { opacity: 0.4; cursor: not-allowed; }
  .no-words { color: #666; font-style: italic; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${rowsHtml}
<script>
(function () {
  var supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  document.querySelectorAll('button.speak').forEach(function (btn) {
    if (!supported) {
      btn.disabled = true;
      btn.title = 'Read-aloud not supported in this browser';
      return;
    }
    btn.addEventListener('click', function () {
      var utterance = new SpeechSynthesisUtterance(btn.getAttribute('data-word'));
      utterance.lang = 'en-GB';
      window.speechSynthesis.speak(utterance);
    });
  });
})();
</script>
</body>
</html>
`;
}
