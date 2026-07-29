import { basename } from "node:path";
import type { LessonSpec } from "../schema/types.ts";
import type { Manifest } from "./renderLessonPage.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes a string for safe embedding inside an HTML attribute value (srcdoc="..."). */
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Pure renderer: `LessonSpec` + optional `Manifest` + each material's raw self-contained HTML ->
 * ONE consolidated page with every exercise embedded inline via `<iframe srcdoc="...">`, not
 * linked out to separate files. `srcdoc` keeps the whole thing a single self-contained file
 * (works `file://`, no extra requests) while still giving each widget its own isolated DOM/CSS/JS
 * scope -- concatenating the widgets' raw HTML directly into one page would collide (several
 * widgets reuse ids like `id="check"`). `onload` auto-sizes each iframe to its content height
 * (srcdoc content is same-origin to the parent per spec, so `contentWindow.document` is
 * readable). No filesystem access here -- the caller owns discovering/reading material files.
 */
export function renderInlineLessonPage(params: {
  spec: LessonSpec;
  manifest?: Manifest | null;
  materials: Array<{ file: string; html: string }>;
}): string {
  const { spec, manifest, materials } = params;

  const competencesHtml = spec.focus_competences
    .map((fc) => `<li>${escapeHtml(fc.id)} — ${escapeHtml(fc.topic)}</li>`)
    .join("\n");

  const materialsHtml =
    materials.length === 0
      ? `<p class="no-materials">No materials yet.</p>`
      : materials
          .map((m) => {
            const entry = manifest?.materials.find((e) => basename(e.file) === basename(m.file));
            const label = entry ? `${entry.title} (${entry.type})` : m.file;
            return `<section class="material">
<h2>${escapeHtml(label)}</h2>
<iframe srcdoc="${escapeAttr(m.html)}" loading="lazy" class="material-frame"
  onload="this.style.height = (this.contentWindow.document.body.scrollHeight + 40) + 'px';"></iframe>
</section>`;
          })
          .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(spec.module.title)} — ${escapeHtml(spec.date)}</title>
<style>
  body { font-family: sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; }
  ul { padding-left: 1.2rem; }
  .no-materials { color: #666; font-style: italic; }
  section.material { margin: 2rem 0; }
  iframe.material-frame { width: 100%; min-height: 200px; border: 1px solid #ccc; border-radius: 0.4rem; }
</style>
</head>
<body>
<h1>${escapeHtml(spec.module.title)}</h1>
<p><strong>Class:</strong> ${escapeHtml(spec.class)} &middot; <strong>Date:</strong> ${escapeHtml(spec.date)} &middot; <strong>Phase:</strong> ${escapeHtml(spec.phase)}</p>
<h2>Focus competences</h2>
<ul>
${competencesHtml}
</ul>
<h2>Materials</h2>
${materialsHtml}
</body>
</html>
`;
}
