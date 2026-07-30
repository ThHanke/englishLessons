import { basename } from "node:path";
import type { LessonSpec } from "../schema/types.ts";

/** §4.7 static-site manifest entry — one per generated/cited material for a lesson date. */
export interface ManifestEntry {
  file: string;
  type: string;
  title: string;
  competenceIds: string[];
  depth: string;
  createdAt: string;
}

export interface Manifest {
  materials: ManifestEntry[];
}

/** §4.2 step 1's structured plan body, as saved by save_lesson_plan (lesson-plan.json) --
 * distinct from `LessonSpec` (the pre-generation constraints) and from `Manifest` (the generated
 * materials). */
export interface LessonPlanStage {
  name: string;
  durationMinutes: number;
  /** One-line "why this stage" -- rendered as an italic sub-heading, textbook-style. */
  purpose: string;
  /** Ordered steps, rendered as a numbered list instead of one prose block. */
  procedure: string[];
  /** manifest.json material filenames (e.g. "materials/gap_fill-....html") used or introduced
   * in this stage -- lets the renderer embed the actual material inline instead of a
   * disconnected Materials section (renderLessonPlanTimeline in renderInlineLessonPage.ts). */
  materialRefs?: string[];
}

export interface LessonPlan {
  objectives: string[];
  stages: LessonPlanStage[];
  differentiationNotes: string;
  exercisePlan: string[];
}

/** Shared with renderInlineLessonPage.ts so stage cards look identical on both page shapes. */
export const STAGE_CARD_CSS = `
  ol.stage-overview { padding-left: 1.2rem; color: #333; }
  ol.stage-overview .duration { color: #666; font-size: 0.9em; }
  section.stage { border: 1px solid #ddd; border-radius: 0.4rem; padding: 0.8rem 1rem; margin: 0 0 1rem; }
  section.stage h3 { margin: 0 0 0.3rem; }
  section.stage .duration { font-weight: normal; color: #666; font-size: 0.85em; }
  section.stage .purpose { margin: 0 0 0.5rem; color: #444; }
  section.stage .procedure { margin: 0; padding-left: 1.2rem; }
`;

/** Duplicated from src/widgets/gapFill.ts (not exported there) - see U5 plan note. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared with renderInlineLessonPage.ts -- both page shapes list objectives/exercise-plan the
 * same way; only the Stages section differs (plain cards here vs. materials embedded inline in
 * renderLessonPlanTimeline). */
export function renderObjectivesHtml(objectives: string[]): string {
  return objectives.map((o) => `<li>${escapeHtml(o)}</li>`).join("\n");
}

export function renderExercisePlanHtml(exercisePlan: string[]): string {
  return exercisePlan.map((e) => `<li>${escapeHtml(e)}</li>`).join("\n");
}

/** Short at-a-glance list (name, duration, one-line purpose) shown before the detailed Timeline
 * -- a table of contents a teacher can scan in seconds, distinct from the full stage cards
 * below it which spell out the actual procedure. */
export function renderStageOverviewHtml(stages: LessonPlanStage[]): string {
  return stages
    .map(
      (s) =>
        `<li><strong>${escapeHtml(s.name)}</strong> <span class="duration">(${s.durationMinutes} min)</span> — ${escapeHtml(s.purpose)}</li>`,
    )
    .join("\n");
}

/** One stage's heading + italic purpose + numbered procedure -- no material embedding here,
 * this stays shared/dumb about materials so both the plain overview page and the dedicated
 * variant pages (renderInlineLessonPage.ts) can reuse it identically. Material embedding is the
 * dedicated lesson-plan page's job (renderLessonPlanTimeline). */
export function renderStageCard(s: LessonPlanStage): string {
  const procedureHtml = s.procedure.map((step) => `<li>${escapeHtml(step)}</li>`).join("\n");
  return `<section class="stage">
<h3>${escapeHtml(s.name)} <span class="duration">${s.durationMinutes} min</span></h3>
<p class="purpose"><em>${escapeHtml(s.purpose)}</em></p>
<ol class="procedure">
${procedureHtml}
</ol>
</section>`;
}

export function renderPlanBody(plan: LessonPlan): string {
  const objectivesHtml = renderObjectivesHtml(plan.objectives);
  const overviewHtml = renderStageOverviewHtml(plan.stages);
  const stagesHtml = plan.stages.map(renderStageCard).join("\n");
  const exercisePlanHtml = renderExercisePlanHtml(plan.exercisePlan);

  return `<h3>Objectives</h3>
<ul>
${objectivesHtml}
</ul>
<h3>Stage overview</h3>
<ol class="stage-overview">
${overviewHtml}
</ol>
<h3>Timeline</h3>
${stagesHtml}
<h3>Differentiation</h3>
<p>${escapeHtml(plan.differentiationNotes)}</p>
<h3>Planned exercises</h3>
<ul>
${exercisePlanHtml}
</ul>`;
}

/**
 * Pure renderer: `LessonSpec` + optional `Manifest` + optional `LessonPlan` + the raw material
 * filenames actually present on disk for this date -> a self-contained lesson page. No filesystem
 * access here; `buildSite.ts` owns discovering `materialFiles` and copying them alongside this
 * page.
 *
 * When a manifest entry exists for a given file (matched by `file` name), its `title`/`type`
 * are used as link text; otherwise the raw filename is used. When `materialFiles` is empty
 * (no manifest, no materials generated yet for this date), a "no materials yet" note is
 * rendered instead of an empty list. When `plan` is absent (older lesson-specs saved before
 * save_lesson_plan existed, or a lesson still in the constraints-only stage), a "no detailed
 * lesson plan saved yet" note renders instead of the objectives/stages/differentiation body.
 */
export function renderLessonPage(params: {
  spec: LessonSpec;
  manifest?: Manifest | null;
  plan?: LessonPlan | null;
  materialFiles: string[];
}): string {
  const { spec, manifest, plan, materialFiles } = params;

  const competencesHtml = spec.focus_competences
    .map((fc) => `<li>${escapeHtml(fc.id)} — ${escapeHtml(fc.topic)}</li>`)
    .join("\n");

  const planHtml = plan
    ? renderPlanBody(plan)
    : `<p class="no-plan">No detailed lesson plan saved for this date yet.</p>`;

  const materialsHtml =
    materialFiles.length === 0
      ? `<p class="no-materials">No materials yet.</p>`
      : `<ul class="materials">\n${materialFiles
          .map((file) => {
            // manifest entries store `file` as "materials/<name>" (artifactTools.ts's
            // generate_exercise), while `materialFiles` here are bare filenames from a
            // directory read -- match on basename so the two conventions don't silently
            // fail to line up.
            const entry = manifest?.materials.find((m) => basename(m.file) === file);
            const linkText = entry ? `${entry.title} (${entry.type})` : file;
            return `<li><a href="materials/${escapeHtml(file)}">${escapeHtml(linkText)}</a></li>`;
          })
          .join("\n")}\n</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(spec.module.title)} — ${escapeHtml(spec.date)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
  ul { padding-left: 1.2rem; }
  .no-materials, .no-plan { color: #666; font-style: italic; }
${STAGE_CARD_CSS}</style>
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
