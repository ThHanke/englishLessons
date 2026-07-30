function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a single self-contained HTML file for an input text a stage reads/plays (e.g. the
 * "Back at School" style short text a stage narrates but which -- before this widget existed --
 * had nowhere to actually live as an artifact). Paragraphs split on blank lines. Read-aloud
 * reuses the same speechSynthesis convention as vocabIntro.ts (fk.k.hoer listening use), reading
 * the whole text as one utterance; disabled (not hidden) when the API is unavailable so the page
 * still degrades to a printable transcript.
 */
export function renderReadingTextHtml(title: string, text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const paragraphsHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');
  const fullText = paragraphs.join(' ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; line-height: 1.5; }
  .controls { margin-bottom: 1rem; }
  button.speak { border: 1px solid #888; border-radius: 0.3rem; background: #fff; cursor: pointer; font-size: 1rem; padding: 0.3rem 0.7rem; }
  button.speak:disabled { opacity: 0.4; cursor: not-allowed; }
  .tts-notice { background: #fff3cd; border: 1px solid #e0c36a; border-radius: 0.3rem; padding: 0.5rem 0.7rem; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="controls">
  <button type="button" class="speak" id="speak-btn" aria-label="Read text aloud">&#128266; Read aloud</button>
</div>
<p id="tts-notice" class="tts-notice" hidden></p>
${paragraphsHtml}
<script>
(function () {
  var supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  var btn = document.getElementById('speak-btn');
  var notice = document.getElementById('tts-notice');
  var fullText = ${JSON.stringify(fullText)};

  function showNotice(message) {
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = false;
  }

  if (!supported) {
    btn.disabled = true;
    btn.title = 'Read-aloud not supported in this browser';
    showNotice('Read-aloud is not supported in this browser.');
    return;
  }

  btn.addEventListener('click', function () {
    if (window.speechSynthesis.getVoices().length === 0) {
      showNotice(
        'No text-to-speech voices are installed on this system. On Linux, install a system ' +
          'TTS engine such as espeak-ng or speech-dispatcher, then reload this page.'
      );
      return;
    }
    var utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = 'en-GB';
    window.speechSynthesis.speak(utterance);
  });
})();
</script>
</body>
</html>
`;
}
