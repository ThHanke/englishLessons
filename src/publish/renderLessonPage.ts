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
  description: string;
}

export interface LessonPlan {
  objectives: string[];
  stages: LessonPlanStage[];
  differentiationNotes: string;
  exercisePlan: string[];
}

/** Duplicated from src/widgets/gapFill.ts (not exported there) - see U5 plan note. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared with renderInlineLessonPage.ts -- the objectives/stages/differentiation/exercise-plan
 * markup is identical in both page shapes, only the surrounding page (linked-materials list vs.
 * inline-embedded iframes) differs. */
export function renderPlanBody(plan: LessonPlan): string {
  const objectivesHtml = plan.objectives.map((o) => `<li>${escapeHtml(o)}</li>`).join("\n");
  const stagesHtml = plan.stages
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${s.durationMinutes} min</td><td>${escapeHtml(s.description)}</td></tr>`,
    )
    .join("\n");
  const exercisePlanHtml = plan.exercisePlan.map((e) => `<li>${escapeHtml(e)}</li>`).join("\n");

  return `<h3>Objectives</h3>
<ul>
${objectivesHtml}
</ul>
<h3>Stages</h3>
<table class="stages">
<thead><tr><th>Stage</th><th>Duration</th><th>Description</th></tr></thead>
<tbody>
${stagesHtml}
</tbody>
</table>
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
