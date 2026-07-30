import { describe, it, expect } from "vitest";
import type { LessonSpec } from "../schema/types.ts";
import {
  renderInlineLessonPage,
  filterMaterialsForVariant,
  hasTestMaterial,
} from "./renderInlineLessonPage.ts";
import type { LessonPlan, Manifest } from "./renderLessonPage.ts";

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

describe("renderInlineLessonPage", () => {
  it("embeds each material inline via an iframe srcdoc, not a link", () => {
    const manifest: Manifest = {
      materials: [
        {
          file: "materials/gap_fill-x.html",
          type: "gap_fill",
          title: "Passive Voice Gap Fill",
          competenceIds: ["fk.g.passive"],
          depth: "practiced",
          createdAt: "2026-08-21T00:00:00Z",
        },
      ],
    };
    const html = renderInlineLessonPage({
      spec: lessonSpec(),
      manifest,
      materials: [{ file: "materials/gap_fill-x.html", html: "<html><body>Fill the gap</body></html>" }],
      variant: "test",
    });

    expect(html).toContain("Passive Voice Gap Fill (gap_fill)");
    expect(html).toContain("<iframe");
    expect(html).toContain("srcdoc=");
    expect(html).toContain("Fill the gap");
    expect(html).not.toMatch(/<a\s+href="materials\//);
  });

  it("escapes quotes in the embedded material HTML so the srcdoc attribute isn't broken out of", () => {
    const html = renderInlineLessonPage({
      spec: lessonSpec(),
      manifest: null,
      materials: [{ file: "materials/x.html", html: '<html><body><input value="a" data-x=\'y\'></body></html>' }],
      variant: "test",
    });
    // The literal double-quote from the embedded HTML must be escaped to &quot; -- an unescaped
    // one would prematurely close the srcdoc="..." attribute.
    const srcdocMatch = html.match(/srcdoc="([^]*?)"\s+loading=/);
    expect(srcdocMatch).toBeTruthy();
    expect(srcdocMatch![1]).not.toContain('value="a"');
    expect(srcdocMatch![1]).toContain("value=&quot;a&quot;");
  });

  it('renders a "no materials yet" note, not broken markup, when there are zero materials', () => {
    const html = renderInlineLessonPage({ spec: lessonSpec(), manifest: null, materials: [], variant: "test" });
    expect(html).toContain("No materials yet.");
    expect(html).not.toContain("<iframe");
  });

  it("falls back to the raw filename as the section label when no manifest entry matches", () => {
    const html = renderInlineLessonPage({
      spec: lessonSpec(),
      manifest: null,
      materials: [{ file: "materials/unlisted.html", html: "<html><body>x</body></html>" }],
      variant: "test",
    });
    expect(html).toContain("materials/unlisted.html");
  });

  it("escapes HTML-significant characters in spec fields", () => {
    const html = renderInlineLessonPage({
      spec: lessonSpec({ module: { id: "m1", title: '<script>alert("x")</script>', week_in_module: 1, of: 4 } }),
      manifest: null,
      materials: [],
      variant: "test",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders multiple materials in the given order, each in its own iframe", () => {
    const html = renderInlineLessonPage({
      spec: lessonSpec(),
      manifest: null,
      materials: [
        { file: "materials/a.html", html: "<html><body>AAA</body></html>" },
        { file: "materials/b.html", html: "<html><body>BBB</body></html>" },
      ],
      variant: "test",
    });
    expect(html.indexOf("AAA")).toBeLessThan(html.indexOf("BBB"));
    expect((html.match(/<iframe/g) ?? []).length).toBe(2);
  });

  it('renders a "no detailed lesson plan saved" note when plan is absent', () => {
    const html = renderInlineLessonPage({
      spec: lessonSpec(),
      manifest: null,
      plan: null,
      materials: [],
      variant: "lesson-plan",
    });
    expect(html).toContain("No detailed lesson plan saved for this date yet.");
  });

  it("renders objectives, stages, differentiation notes, and the exercise plan when present", () => {
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
    const html = renderInlineLessonPage({
      spec: lessonSpec(),
      manifest: null,
      plan,
      materials: [],
      variant: "lesson-plan",
    });

    expect(html).toContain("Identify active vs passive voice");
    expect(html).toContain("Warm-up");
    expect(html).toContain("9 min");
    expect(html).toContain("Band 1 gets a full word bank.");
    expect(html).toContain("gap_fill: 6 sentences, supported");
  });
});

describe("filterMaterialsForVariant", () => {
  const manifest: Manifest = {
    materials: [
      { file: "materials/gap_fill-x.html", type: "gap_fill", title: "Gap Fill", competenceIds: [], depth: "practiced", createdAt: "" },
      { file: "materials/vocab_intro-x.html", type: "vocab_intro", title: "Vocab", competenceIds: [], depth: "introduced", createdAt: "" },
      { file: "materials/homework-x.html", type: "homework", title: "Homework", competenceIds: [], depth: "practiced", createdAt: "" },
      { file: "materials/test-x.html", type: "test", title: "Test", competenceIds: [], depth: "assessed", createdAt: "" },
    ],
  };
  const materials = manifest.materials.map((m) => ({ file: m.file, html: `<html>${m.title}</html>` }));

  it("lesson-plan variant excludes homework and test", () => {
    const filtered = filterMaterialsForVariant(materials, manifest, "lesson-plan");
    expect(filtered.map((m) => m.file)).toEqual([
      "materials/gap_fill-x.html",
      "materials/vocab_intro-x.html",
    ]);
  });

  it("homework variant includes only homework", () => {
    const filtered = filterMaterialsForVariant(materials, manifest, "homework");
    expect(filtered.map((m) => m.file)).toEqual(["materials/homework-x.html"]);
  });

  it("test variant includes only test", () => {
    const filtered = filterMaterialsForVariant(materials, manifest, "test");
    expect(filtered.map((m) => m.file)).toEqual(["materials/test-x.html"]);
  });

  it("with no manifest, everything falls into the lesson-plan bucket", () => {
    const filtered = filterMaterialsForVariant(materials, null, "lesson-plan");
    expect(filtered.length).toBe(materials.length);
  });
});

describe("hasTestMaterial", () => {
  it("is true when a test-type material exists", () => {
    const manifest: Manifest = {
      materials: [
        { file: "materials/test-x.html", type: "test", title: "Test", competenceIds: [], depth: "assessed", createdAt: "" },
      ],
    };
    expect(hasTestMaterial(manifest)).toBe(true);
  });

  it("is false when no test-type material exists", () => {
    const manifest: Manifest = {
      materials: [
        { file: "materials/homework-x.html", type: "homework", title: "Homework", competenceIds: [], depth: "practiced", createdAt: "" },
      ],
    };
    expect(hasTestMaterial(manifest)).toBe(false);
  });

  it("is false for a null manifest", () => {
    expect(hasTestMaterial(null)).toBe(false);
  });
});
