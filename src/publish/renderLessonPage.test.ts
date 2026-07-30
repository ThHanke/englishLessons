import { describe, it, expect } from "vitest";
import type { LessonSpec } from "../schema/types.ts";
import { renderLessonPage, type LessonPlan, type Manifest } from "./renderLessonPage.ts";

function lessonSpec(overrides: Partial<LessonSpec> = {}): LessonSpec {
  return {
    class: "grade-7-2026",
    date: "2026-08-21",
    school_week: 2,
    module: { id: "m1", title: "Passive Voice Intro", week_in_module: 1, of: 4 },
    phase: "new_input",
    pace_factor: 1,
    pace_reason: "normal",
    focus_competences: [
      { id: "fk.g.passive", topic: "passive voice", mode: ["understand"] },
    ],
    content_field: { id: "c.test", text: "Test content" },
    text_types: ["dialog"],
    milestone_context: { next: "test", in_slots: 5, assesses: ["fk.g.passive"] },
    prior_covered: [],
    cefr_target: "B1",
    known_vocab_ref: "grade-7-2026@m1",
    textbook_refs: [],
    suggested_exercise_types: ["gap_fill"],
    curriculum_ref: "sa-sek-en-2019",
    ...overrides,
  };
}

describe("renderLessonPage", () => {
  it("includes the module title, focus competences, and a link per manifest entry with its title as link text", () => {
    // artifactTools.ts's generate_exercise always stores `file` as "materials/<name>" (a
    // repo-relative path), not a bare filename -- the manifest fixture mirrors that real shape
    // so this test actually exercises the matching logic instead of matching by coincidence.
    const manifest: Manifest = {
      materials: [
        {
          file: "materials/01-gap-fill-passive-voice.html",
          type: "gap_fill",
          title: "Passive Voice Gap Fill",
          competenceIds: ["fk.g.passive"],
          depth: "practiced",
          createdAt: "2026-08-21T00:00:00Z",
        },
      ],
    };

    const html = renderLessonPage({
      spec: lessonSpec(),
      manifest,
      materialFiles: ["01-gap-fill-passive-voice.html"],
    });

    expect(html).toContain("Passive Voice Intro");
    expect(html).toContain("fk.g.passive");
    expect(html).toContain("passive voice");
    expect(html).toContain('href="materials/01-gap-fill-passive-voice.html"');
    expect(html).toContain("Passive Voice Gap Fill");
  });

  it("falls back to the raw filename as link text when no manifest entry matches a material file", () => {
    const html = renderLessonPage({
      spec: lessonSpec(),
      manifest: null,
      materialFiles: ["01-unlisted-material.html"],
    });

    expect(html).toContain('href="materials/01-unlisted-material.html"');
    expect(html).toContain("01-unlisted-material.html");
  });

  it('renders a "no materials yet" note, not broken links, when there are zero material files', () => {
    const html = renderLessonPage({
      spec: lessonSpec(),
      manifest: null,
      materialFiles: [],
    });

    expect(html).toContain("No materials yet");
    expect(html).not.toContain("<a href=\"materials/");
  });

  it("escapes HTML-significant characters in spec fields", () => {
    const html = renderLessonPage({
      spec: lessonSpec({ module: { id: "m1", title: '<script>alert("x")</script>', week_in_module: 1, of: 4 } }),
      manifest: null,
      materialFiles: [],
    });

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it('renders a "no detailed lesson plan saved" note when plan is absent', () => {
    const html = renderLessonPage({ spec: lessonSpec(), manifest: null, plan: null, materialFiles: [] });
    expect(html).toContain("No detailed lesson plan saved for this date yet.");
    expect(html).not.toContain("<h3>Objectives</h3>");
  });

  it("renders objectives, stages (with duration), differentiation notes, and the exercise plan when present", () => {
    const plan: LessonPlan = {
      objectives: ["Identify active vs passive voice"],
      stages: [
        {
          name: "Warm-up",
          durationMinutes: 9,
          purpose: "Retrieval practice",
          procedure: ["Quick oral recall of last lesson's target forms."],
        },
      ],
      differentiationNotes: "Band 1 gets a full word bank.",
      exercisePlan: ["gap_fill: 6 sentences, supported"],
    };
    const html = renderLessonPage({ spec: lessonSpec(), manifest: null, plan, materialFiles: [] });

    expect(html).toContain("Identify active vs passive voice");
    expect(html).toContain("Warm-up");
    expect(html).toContain("9 min");
    expect(html).toContain("Retrieval practice");
    expect(html).toContain("Quick oral recall of last lesson's target forms.");
    expect(html).toContain("Band 1 gets a full word bank.");
    expect(html).toContain("gap_fill: 6 sentences, supported");
    expect(html).not.toContain("No detailed lesson plan saved");
  });

  it("escapes HTML in plan fields", () => {
    const plan: LessonPlan = {
      objectives: ['<script>alert("x")</script>'],
      stages: [
        {
          name: "<b>Warm-up</b>",
          durationMinutes: 5,
          purpose: "<i>purpose</i>",
          procedure: ["<i>desc</i>"],
        },
      ],
      differentiationNotes: "<u>notes</u>",
      exercisePlan: ["<em>plan</em>"],
    };
    const html = renderLessonPage({ spec: lessonSpec(), manifest: null, plan, materialFiles: [] });

    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>Warm-up</b>");
    expect(html).not.toContain("<i>purpose</i>");
    expect(html).not.toContain("<i>desc</i>");
    expect(html).not.toContain("<u>notes</u>");
    expect(html).not.toContain("<em>plan</em>");
  });
});
