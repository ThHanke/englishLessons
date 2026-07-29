import { describe, it, expect } from "vitest";
import type { ModulesFile } from "../../schema/types.ts";
import { buildLedger, lastTaughtDate } from "./buildLedger.ts";

const FIXTURE_REPO_ROOT = new URL("./fixtures/ledger-repo/", import.meta.url)
  .pathname;

function modulesFile(overrides: Partial<ModulesFile> = {}): ModulesFile {
  return {
    class: "class-a",
    curriculum: "fixture-curriculum",
    total_weeks: 4,
    weekly_lessons: 3,
    buffer_weeks: 0,
    modules: [
      {
        id: "m1",
        title: "Module One",
        weeks: 2,
        content_fields: [],
        goals: [],
        covers: [
          { id: "c.x", required_depth: "understand" },
          { id: "c.y", required_depth: "produce" },
        ],
        milestone: { type: "test", assesses: ["c.x", "c.y"] },
        pedagogy: { new_grammar: [] },
      },
    ],
    ...overrides,
  };
}

describe("buildLedger", () => {
  it('folds every scanned lesson-spec.json (recursively) into the ledger at depth "introduced"', () => {
    const ledger = buildLedger("class-a", modulesFile(), FIXTURE_REPO_ROOT);
    expect(ledger.competences["c.x"]!.maxDepth).toBe("introduced");
    expect(ledger.competences["c.y"]!.maxDepth).toBe("introduced");
    expect(ledger.competences["c.x"]!.exerciseTypesUsed).toEqual(["gap_fill"]);
    expect(ledger.competences["c.y"]!.exerciseTypesUsed).toEqual([
      "writing_prompt",
    ]);
  });

  it('never folds a lesson-spec-derived record above "introduced", so a produce-required competence never counts as met from plan artifacts alone', () => {
    const ledger = buildLedger("class-a", modulesFile(), FIXTURE_REPO_ROOT);
    const m1 = ledger.modules.find((m) => m.moduleId === "m1")!;
    // c.x (understand) and c.y (produce) both only ever reach 'introduced' via scanned specs -
    // meetsRequiredDepth never returns true below 'practiced', so metCount stays 0.
    expect(m1.metCount).toBe(0);
  });

  it("returns an empty-but-valid ledger, not a throw, when the class has no artifacts/<className> directory on disk", () => {
    const ledger = buildLedger(
      "a-class-with-no-artifacts-dir",
      modulesFile({ class: "a-class-with-no-artifacts-dir" }),
      FIXTURE_REPO_ROOT,
    );
    expect(ledger).toEqual({
      competences: {},
      modules: [
        {
          moduleId: "m1",
          targetCount: 2,
          metCount: 0,
          percentAtRequiredDepth: 0,
        },
      ],
    });
  });

  describe("manifest.json integration (U3)", () => {
    it("a date with both lesson-spec.json and manifest.json: the manifest's stronger depth wins for the shared competence, and a manifest-only competence still folds in", () => {
      const ledger = buildLedger(
        "class-manifest-stronger",
        modulesFile({ class: "class-manifest-stronger" }),
        FIXTURE_REPO_ROOT,
      );
      // c.x: lesson-spec says 'introduced', manifest says 'practiced' -> practiced wins.
      expect(ledger.competences["c.x"]!.maxDepth).toBe("practiced");
      expect(ledger.competences["c.x"]!.exerciseTypesUsed).toContain("gap_fill");
      // c.z: named only in the manifest, absent from the lesson-spec's focus_competences.
      expect(ledger.competences["c.z"]!.maxDepth).toBe("practiced");
      expect(ledger.competences["c.z"]!.exerciseTypesUsed).toEqual(["mcq"]);
    });

    it("a manifest.json with empty materials: [] contributes no coverage and does not crash", () => {
      const ledger = buildLedger(
        "class-manifest-empty",
        modulesFile({ class: "class-manifest-empty" }),
        FIXTURE_REPO_ROOT,
      );
      // Only the lesson-spec's 'introduced' record for c.x is present; the empty manifest added nothing.
      expect(ledger.competences["c.x"]!.maxDepth).toBe("introduced");
    });

    it("folds manifest entries for the same competence at different depths across different dates via the existing max-depth-across-dates logic", () => {
      const ledger = buildLedger(
        "class-manifest-multidate",
        modulesFile({ class: "class-manifest-multidate" }),
        FIXTURE_REPO_ROOT,
      );
      expect(ledger.competences["c.w"]!.maxDepth).toBe("assessed");
      expect(ledger.competences["c.w"]!.datesTouched.sort()).toEqual([
        "2026-09-01",
        "2026-09-08",
      ]);
    });

    it("a produce-required competence covered only by an mcq manifest entry still reports as under-depth (mcq isn't a PRODUCTIVE_EXERCISE_TYPE) -- expected boundary, not a bug", () => {
      const modules = modulesFile({
        class: "class-manifest-produce-mcq",
        modules: [
          {
            id: "m1",
            title: "Module One",
            weeks: 2,
            content_fields: [],
            goals: [],
            covers: [{ id: "c.p", required_depth: "produce" }],
            milestone: { type: "test", assesses: ["c.p"] },
            pedagogy: { new_grammar: [] },
          },
        ],
      });
      const ledger = buildLedger("class-manifest-produce-mcq", modules, FIXTURE_REPO_ROOT);
      expect(ledger.competences["c.p"]!.maxDepth).toBe("practiced");
      const m1 = ledger.modules.find((m) => m.moduleId === "m1")!;
      expect(m1.metCount).toBe(0);
    });
  });
});

describe("lastTaughtDate", () => {
  it("prefers the max manifest date over lesson-spec dates", () => {
    expect(lastTaughtDate("class-manifest-multidate", FIXTURE_REPO_ROOT)).toBe(
      "2026-09-08",
    );
  });

  it("falls back to the max lesson-spec date (recursively, across nested dirs) when no manifest exists yet", () => {
    expect(lastTaughtDate("class-a", FIXTURE_REPO_ROOT)).toBe("2026-08-10");
  });

  it("returns null for a class with no artifacts directory on disk", () => {
    expect(lastTaughtDate("class-with-no-artifacts", FIXTURE_REPO_ROOT)).toBeNull();
  });
});
