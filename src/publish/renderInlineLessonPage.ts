import { basename } from "node:path";
import type { LessonSpec } from "../schema/types.ts";
import {
  renderPlanBody,
  renderStageCard,
  renderObjectivesHtml,
  renderExercisePlanHtml,
  renderStageOverviewHtml,
  STAGE_CARD_CSS,
  STAGE_TIMER_JS,
  type LessonPlan,
  type Manifest,
} from "./renderLessonPage.ts";

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

/** A material embedded inline (title + self-checking iframe), same markup used both by the
 * lesson-plan timeline (grouped under the stage that uses it) and the flat homework/test
 * material list. */
function renderEmbeddedMaterial(
  m: { file: string; html: string },
  manifest: Manifest | null | undefined,
): string {
  const entry = manifest?.materials.find((e) => basename(e.file) === basename(m.file));
  const label = entry ? `${entry.title} (${entry.type})` : m.file;
  return `<section class="material">
<h4>${escapeHtml(label)}</h4>
<iframe srcdoc="${escapeAttr(m.html)}" loading="lazy" class="material-frame"
  onload="this.style.height = (this.contentWindow.document.body.scrollHeight + 40) + 'px';"></iframe>
</section>`;
}

/** The lesson-plan variant's body: objectives, then stages with each stage's `materialRefs`
 * embedded directly under it (a textbook-style timeline) instead of the flat, disconnected
 * Materials section every other variant uses. Materials not referenced by any stage still
 * render (trailing "Additional materials") rather than being silently dropped -- shouldn't
 * normally happen once save_lesson_plan's tool description (materialRefs requirement) is
 * followed, but a stale/hand-edited plan shouldn't lose a material either. */
export function renderLessonPlanTimeline(
  plan: LessonPlan,
  materials: Array<{ file: string; html: string }>,
  manifest: Manifest | null | undefined,
): string {
  const byBasename = new Map(materials.map((m) => [basename(m.file), m]));
  const used = new Set<string>();

  const stagesHtml = plan.stages
    .map((stage) => {
      const card = renderStageCard(stage);
      const refsHtml = (stage.materialRefs ?? [])
        .map((ref) => {
          const bn = basename(ref);
          const m = byBasename.get(bn);
          if (!m) return "";
          used.add(bn);
          return renderEmbeddedMaterial(m, manifest);
        })
        .filter((h) => h.length > 0)
        .join("\n");
      return refsHtml ? card.replace("</section>", `${refsHtml}\n</section>`) : card;
    })
    .join("\n");

  const leftover = materials.filter((m) => !used.has(basename(m.file)));
  const leftoverHtml =
    leftover.length === 0
      ? ""
      : `<h3>Additional materials</h3>\n${leftover.map((m) => renderEmbeddedMaterial(m, manifest)).join("\n")}`;

  return `<h3>Objectives</h3>
<ul>
${renderObjectivesHtml(plan.objectives)}
</ul>
<h3>Stage overview</h3>
<ol class="stage-overview">
${renderStageOverviewHtml(plan.stages)}
</ol>
<h3>Timeline</h3>
${stagesHtml}
${leftoverHtml}
<h3>Differentiation</h3>
<p>${escapeHtml(plan.differentiationNotes)}</p>
<h3>Planned exercises</h3>
<ul>
${renderExercisePlanHtml(plan.exercisePlan)}
</ul>`;
}

export function renderInlineLessonPage(params: {
  spec: LessonSpec;
  manifest?: Manifest | null;
  plan?: LessonPlan | null;
  materials: Array<{ file: string; html: string }>;
  variant: LessonPageVariant;
  /** Homework variant only -- the class's next scheduled lesson date after this one, computed
   * from the calendar (findNextLessonDate). Omitted when there's no further scheduled lesson. */
  dueDate?: string;
}): string {
  const { spec, manifest, plan, materials, variant, dueDate } = params;

  const competencesHtml = spec.focus_competences
    .map((fc) => `<li>${escapeHtml(fc.id)} — ${escapeHtml(fc.topic)}</li>`)
    .join("\n");

  const isLessonPlanTimeline = variant === "lesson-plan" && !!plan;

  const planHtml = plan
    ? isLessonPlanTimeline
      ? renderLessonPlanTimeline(plan, materials, manifest)
      : renderPlanBody(plan)
    : `<p class="no-plan">No detailed lesson plan saved for this date yet.</p>`;

  // The lesson-plan timeline already embeds every material inline under its stage -- a second
  // flat listing below would just duplicate every iframe. Homework/test keep the flat list.
  const materialsSectionHtml = isLessonPlanTimeline
    ? ""
    : `<h2>Materials</h2>
${
  materials.length === 0
    ? `<p class="no-materials">No materials yet.</p>`
    : materials.map((m) => renderEmbeddedMaterial(m, manifest)).join("\n")
}`;

  const dueDateHtml =
    variant === "homework" && dueDate
      ? `<p class="due-date"><strong>Due:</strong> ${escapeHtml(dueDate)}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(spec.module.title)} — ${escapeHtml(spec.date)}</title>
<style>
  body { font-family: sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; }
  ul { padding-left: 1.2rem; }
  .no-materials, .no-plan { color: #666; font-style: italic; }
  .due-date { background: #fff3cd; border: 1px solid #e0c36a; border-radius: 0.3rem; padding: 0.4rem 0.7rem; display: inline-block; }
  section.material { margin: 2rem 0; }
  section.material h4 { margin: 0 0 0.4rem; }
  iframe.material-frame { width: 100%; min-height: 200px; border: 1px solid #ccc; border-radius: 0.4rem; }
  section.stage section.material { margin: 1rem 0 0; }
  section.stage section.material iframe.material-frame { min-height: 150px; }
${STAGE_CARD_CSS}</style>
</head>
<body>
<h1>${escapeHtml(spec.module.title)}</h1>
<p><strong>Class:</strong> ${escapeHtml(spec.class)} &middot; <strong>Date:</strong> ${escapeHtml(spec.date)} &middot; <strong>Phase:</strong> ${escapeHtml(spec.phase)}</p>
${dueDateHtml}
<h2>Focus competences</h2>
<ul>
${competencesHtml}
</ul>
<h2>Lesson plan</h2>
${planHtml}
${materialsSectionHtml}
<script>${STAGE_TIMER_JS}</script>
</body>
</html>
`;
}
