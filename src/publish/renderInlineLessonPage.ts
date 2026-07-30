import { basename } from "node:path";
import type { LessonSpec } from "../schema/types.ts";
import { renderPlanBody, type LessonPlan, type Manifest } from "./renderLessonPage.ts";

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
export type LessonPageVariant = "lesson-plan" | "homework" | "test";

/** Splits a lesson's materials by manifest `type` for the three-way artifact page split (dev
 * route `routes/artifacts.ts` and static `buildSite.ts` both call this so the grouping can't
 * drift between the two). `lesson-plan` gets everything except homework/test (exercises,
 * vocab_intro, etc.); `homework`/`test` get only their own type. Materials with no matching
 * manifest entry (shouldn't happen in practice, but not fatal) fall into the `lesson-plan`
 * bucket rather than being silently dropped. */
export function filterMaterialsForVariant(
  materials: Array<{ file: string; html: string }>,
  manifest: Manifest | null | undefined,
  variant: LessonPageVariant,
): Array<{ file: string; html: string }> {
  const typeOf = (file: string) =>
    manifest?.materials.find((m) => basename(m.file) === basename(file))?.type;
  if (variant === "homework") return materials.filter((m) => typeOf(m.file) === "homework");
  if (variant === "test") return materials.filter((m) => typeOf(m.file) === "test");
  return materials.filter((m) => typeOf(m.file) !== "homework" && typeOf(m.file) !== "test");
}

export function hasTestMaterial(manifest: Manifest | null | undefined): boolean {
  return manifest?.materials.some((m) => m.type === "test") ?? false;
}

export function renderInlineLessonPage(params: {
  spec: LessonSpec;
  manifest?: Manifest | null;
  plan?: LessonPlan | null;
  materials: Array<{ file: string; html: string }>;
}): string {
  const { spec, manifest, plan, materials } = params;

  const competencesHtml = spec.focus_competences
    .map((fc) => `<li>${escapeHtml(fc.id)} — ${escapeHtml(fc.topic)}</li>`)
    .join("\n");

  const planHtml = plan
    ? renderPlanBody(plan)
    : `<p class="no-plan">No detailed lesson plan saved for this date yet.</p>`;

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
  .no-materials, .no-plan { color: #666; font-style: italic; }
  section.material { margin: 2rem 0; }
  iframe.material-frame { width: 100%; min-height: 200px; border: 1px solid #ccc; border-radius: 0.4rem; }
  table.stages { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; }
  table.stages th, table.stages td { border: 1px solid #ccc; padding: 0.3rem 0.5rem; text-align: left; }
</style>
</head>
<body>
<h1>${escapeHtml(spec.module.title)}</h1>
<p><strong>Class:</strong> ${escapeHtml(spec.class)} &middot; <strong>Date:</strong> ${escapeHtml(spec.date)} &middot; <strong>Phase:</strong> ${escapeHtml(spec.phase)}</p>
<h2>Focus competences</h2>
<ul>
${competencesHtml}
</ul>
<h2>Lesson plan</h2>
${planHtml}
<h2>Materials</h2>
${materialsHtml}
</body>
</html>
`;
}
