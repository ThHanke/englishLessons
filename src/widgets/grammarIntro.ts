export interface GrammarExample {
  /** e.g. "Active: The teacher cleans the room." */
  before?: string;
  /** e.g. "Passive: The room is cleaned (by the teacher)." -- the target form, always present. */
  after: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file for a grammar point a stage introduces or recaps --
 * the structured counterpart to renderVocabIntroHtml, for grammar instead of vocabulary. Fills
 * the gap where a lesson's actual grammar focus (e.g. passive voice) had nowhere to live except
 * as an aside buried in a stage's procedure text ("Mini board note: ..."). `explanation` must be
 * plain language, no unexplained grammar jargon -- this is read by the pupil, not just the
 * teacher. Each example pairs the source form with the target form so the transformation is
 * visible, not just asserted.
 */
export function renderGrammarIntroHtml(
  title: string,
  explanation: string,
  examples: GrammarExample[],
): string {
  const examplesHtml =
    examples.length === 0
      ? `<p class="no-examples">No examples for this grammar point.</p>`
      : `<ul class="grammar-examples">
${examples
  .map(
    (ex) => `<li>${ex.before ? `<span class="before">${escapeHtml(ex.before)}</span><br>` : ''}<span class="after">${escapeHtml(ex.after)}</span></li>`,
  )
  .join('\n')}
</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; line-height: 1.5; }
  .explanation { background: #eef4ff; border: 1px solid #b7cdf0; border-radius: 0.4rem; padding: 0.7rem 1rem; }
  ul.grammar-examples { list-style: none; padding: 0; }
  ul.grammar-examples li { border-bottom: 1px solid #eee; padding: 0.5rem 0; }
  .before { color: #666; }
  .after { font-weight: 600; }
  .no-examples { color: #666; font-style: italic; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="explanation">${escapeHtml(explanation)}</p>
${examplesHtml}
</body>
</html>
`;
}
