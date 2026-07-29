export interface FlashcardItem {
  front: string;
  back: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file (no external <script src>/<link> - everything
 * inline), following the other widgets' pattern. Flashcards have no right/wrong answer to
 * auto-check (matches exercise-design-reference's flashcards guidance: "simple flip +
 * localStorage; no algorithm needed for MVP") -- each card flips front/back on click and the
 * pupil self-rates "Got it" / "Still learning", tallied as a plain in-page count, not persisted
 * (no spaced-repetition scheduling; this is a review aid, not an SRS app).
 */
export function renderFlashcardsHtml(title: string, items: FlashcardItem[]): string {
  const cardsHtml = items
    .map(
      (item, i) => `
    <div class="card" data-card="${i}" data-state="front">
      <button type="button" class="flip" data-card="${i}">
        <span class="face front">${escapeHtml(item.front)}</span>
        <span class="face back">${escapeHtml(item.back)}</span>
      </button>
      <div class="rate" data-rate="${i}" hidden>
        <button type="button" class="know" data-card="${i}">Got it</button>
        <button type="button" class="learning" data-card="${i}">Still learning</button>
      </div>
      <p class="rated" data-rated="${i}" hidden></p>
    </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; color: #111; }
  .deck { display: flex; flex-direction: column; gap: 1rem; }
  .card { border: 1px solid #ccc; border-radius: 0.5rem; padding: 1rem; text-align: center; }
  button.flip { width: 100%; min-height: 4rem; font: inherit; font-size: 1.1rem; cursor: pointer;
    border: 1px solid #888; border-radius: 0.4rem; background: #fff; padding: 1rem; }
  .face.back { display: none; color: #06c; }
  .card[data-state="back"] .face.front { display: none; }
  .card[data-state="back"] .face.back { display: inline; }
  .rate { margin-top: 0.6rem; display: flex; gap: 0.5rem; justify-content: center; }
  .rated { margin-top: 0.6rem; font-weight: bold; }
  p#summary { font-weight: bold; margin-top: 1.5rem; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>Click a card to reveal the answer, then rate yourself.</p>
<div class="deck">${cardsHtml}</div>
<p id="summary"></p>
<script>
(function () {
  var total = ${items.length};
  var rated = {};

  document.querySelectorAll('button.flip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = btn.getAttribute('data-card');
      var card = document.querySelector('.card[data-card="' + i + '"]');
      var isBack = card.getAttribute('data-state') === 'back';
      card.setAttribute('data-state', isBack ? 'front' : 'back');
      var rateEl = document.querySelector('.rate[data-rate="' + i + '"]');
      if (!isBack) rateEl.hidden = false;
    });
  });

  function updateSummary() {
    var known = 0;
    var seen = 0;
    for (var k in rated) {
      seen++;
      if (rated[k] === 'know') known++;
    }
    document.getElementById('summary').textContent =
      seen === 0 ? '' : known + ' / ' + seen + ' known so far (' + total + ' cards total)';
  }

  document.querySelectorAll('button.know, button.learning').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = btn.getAttribute('data-card');
      var rating = btn.classList.contains('know') ? 'know' : 'learning';
      rated[i] = rating;
      var ratedEl = document.querySelector('[data-rated="' + i + '"]');
      ratedEl.hidden = false;
      ratedEl.textContent = rating === 'know' ? 'Marked: Got it' : 'Marked: Still learning';
      updateSummary();
    });
  });
})();
</script>
</body>
</html>
`;
}
