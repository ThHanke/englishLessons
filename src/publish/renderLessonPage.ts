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

/** Who's driving this step, and whether it gets a pupil-facing countdown timer. `pupil_work`
 * steps with a `durationMinutes` render a Start-timer button; `teacher_intro`/`correction` never
 * do (a teacher-led step isn't something pupils count down on their own). */
export type LessonPlanStepKind = "teacher_intro" | "pupil_work" | "correction";

export interface LessonPlanStep {
  kind: LessonPlanStepKind;
  text: string;
  /** Only meaningful for `pupil_work` -- renders a Start-timer button for this step. Optional
   * even there: a pupil_work step without one just renders as plain text, no timer (teacher
   * times it manually) rather than being rejected. */
  durationMinutes?: number;
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
  procedure: LessonPlanStep[];
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
  section.stage .procedure li { margin: 0.3rem 0; }
  .step-kind { display: inline-block; font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.03em; color: #666; border: 1px solid #ccc; border-radius: 0.25rem; padding: 0.05rem 0.35rem; margin-right: 0.4rem; vertical-align: middle; }
  .step-pupil_work .step-kind { border-color: #7aa87a; color: #2f6b2f; }
  .step-correction .step-kind { border-color: #d8b060; color: #8a6416; }
  .timer { display: block; margin: 0.3rem 0 0 0; }
  button.timer-start { display: inline-flex; align-items: center; gap: 0.3rem; border: 1px solid #888; border-radius: 0.3rem; background: #fff; cursor: pointer; font-size: 0.85em; padding: 0.2rem 0.5rem; }
  .timer-display { display: inline-flex; align-items: center; gap: 0.3rem; font-variant-numeric: tabular-nums; font-size: 1.1em; font-weight: 600; border: 1px solid #888; border-radius: 0.3rem; padding: 0.1rem 0.5rem; }
  .timer-display.timer-done { color: #a4262c; border-color: #a4262c; background: #fdecea; }
`;

/** Countdown timer for `pupil_work` procedure steps -- plain setInterval, no library. Visual
 * only at zero (turns red) -- deliberately no sound: autoplay-audio reliability varies across
 * devices/browsers, and a silent cue is less disruptive across multiple pupil screens in one
 * room than several unsynced beeps. Delegated listener (not one per button) so it works
 * regardless of how many stage cards/timers a page renders. */
export const STAGE_TIMER_JS = `
(function () {
  function formatTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  document.addEventListener('click', function (event) {
    var btn = event.target.closest('button.timer-start');
    if (!btn) return;
    var wrapper = btn.closest('.timer');
    var display = wrapper.querySelector('.timer-display');
    var clock = display.querySelector('.timer-clock');
    var remaining = parseInt(wrapper.getAttribute('data-minutes'), 10) * 60;
    btn.hidden = true;
    display.hidden = false;
    clock.textContent = formatTime(remaining);
    var interval = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clock.textContent = '0:00';
        display.classList.add('timer-done');
        clearInterval(interval);
        return;
      }
      clock.textContent = formatTime(remaining);
    }, 1000);
  });
})();
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

const STEP_KIND_LABEL: Record<LessonPlanStepKind, string> = {
  teacher_intro: "Teacher",
  pupil_work: "Pupils",
  correction: "Correction",
};

/** Minimal inline clock icon -- self-contained (no icon font/CDN), matching this repo's
 * single-file-widget convention. */
const TIMER_ICON_SVG =
  '<svg class="timer-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function renderProcedureStep(step: LessonPlanStep): string {
  const kindLabel = STEP_KIND_LABEL[step.kind];
  // The clock icon only exists inside .timer-display, which stays `hidden` until the button is
  // clicked -- it should "spawn" once the timer actually starts, not sit on the Start button
  // before anything is running. JS (STAGE_TIMER_JS) writes the countdown into .timer-clock,
  // leaving the icon markup around it untouched.
  const timerHtml =
    step.kind === "pupil_work" && step.durationMinutes
      ? `<span class="timer" data-minutes="${step.durationMinutes}">
<button type="button" class="timer-start">Start ${step.durationMinutes} min timer</button>
<span class="timer-display" hidden>${TIMER_ICON_SVG}<span class="timer-clock"></span></span>
</span>`
      : "";
  return `<li class="step step-${step.kind}">
<span class="step-kind">${escapeHtml(kindLabel)}</span>
<span class="step-text">${escapeHtml(step.text)}</span>
${timerHtml}
</li>`;
}

/** One stage's heading + italic purpose + numbered procedure -- no material embedding here,
 * this stays shared/dumb about materials so both the plain overview page and the dedicated
 * variant pages (renderInlineLessonPage.ts) can reuse it identically. Material embedding is the
 * dedicated lesson-plan page's job (renderLessonPlanTimeline). */
export function renderStageCard(s: LessonPlanStage): string {
  const procedureHtml = s.procedure.map(renderProcedureStep).join("\n");
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
<script>${STAGE_TIMER_JS}</script>
</body>
</html>
`;
}
