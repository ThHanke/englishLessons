import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { resolveKnownVocabulary } from "./resolveKnownVocabulary.ts";

describe("resolveKnownVocabulary", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "resolve-known-vocab-"));
    mkdirSync(join(repoRoot, "vocabulary"), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function writeVocab(stem: string, file: Record<string, unknown>) {
    writeFileSync(join(repoRoot, "vocabulary", `${stem}.yaml`), stringify(file));
  }

  it("resolves a root class (no inherits_from) to just its own modules", () => {
    writeVocab("grade-5", {
      class: "grade-5-2026",
      inherits_from: null,
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["name", "age", "reality show"] },
      taught_through: "m1",
    });

    const known = resolveKnownVocabulary("grade-5-2026@m1", repoRoot);
    expect(known).toEqual(new Set(["name", "age", "reality show"]));
  });

  it("unions a predecessor's full vocabulary with the current grade's own modules", () => {
    writeVocab("grade-5", {
      class: "grade-5-2026",
      inherits_from: null,
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["name"], m2: ["age"] },
      taught_through: "m2",
    });
    writeVocab("grade-6", {
      class: "grade-6-2027",
      inherits_from: "grade-5",
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["holiday"] },
      taught_through: "m1",
    });

    const known = resolveKnownVocabulary("grade-6-2027@m1", repoRoot);
    expect(known).toEqual(new Set(["name", "age", "holiday"]));
  });

  it("walks a two-level inherits_from chain", () => {
    writeVocab("grade-5", {
      class: "grade-5-2026",
      inherits_from: null,
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["name"] },
      taught_through: "m1",
    });
    writeVocab("grade-6", {
      class: "grade-6-2027",
      inherits_from: "grade-5",
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["holiday"] },
      taught_through: "m1",
    });
    writeVocab("grade-7-realschule", {
      class: "grade-7-realschule-2026",
      inherits_from: "grade-6",
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["media", "broadcast"] },
      taught_through: "m1",
    });

    const known = resolveKnownVocabulary("grade-7-realschule-2026@m1", repoRoot);
    expect(known).toEqual(new Set(["name", "holiday", "media", "broadcast"]));
  });

  it("applies overrides.add and overrides.remove", () => {
    writeVocab("grade-5", {
      class: "grade-5-2026",
      inherits_from: null,
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["name", "age"] },
      taught_through: "m1",
      overrides: { add: ["holiday"], remove: ["age"] },
    });

    const known = resolveKnownVocabulary("grade-5-2026@m1", repoRoot);
    expect(known).toEqual(new Set(["name", "holiday"]));
  });

  it("normalizes case/whitespace", () => {
    writeVocab("grade-5", {
      class: "grade-5-2026",
      inherits_from: null,
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["  Name  ", "AGE"] },
      taught_through: "m1",
    });

    const known = resolveKnownVocabulary("grade-5-2026@m1", repoRoot);
    expect(known).toEqual(new Set(["name", "age"]));
  });

  it("throws a clear error when no vocabulary file matches the ref's class", () => {
    expect(() => resolveKnownVocabulary("not-a-real-class@m1", repoRoot)).toThrow(
      /No vocabulary.*not-a-real-class/,
    );
  });

  it("ignores the @<module> suffix -- the cutoff always comes from taught_through", () => {
    writeVocab("grade-5", {
      class: "grade-5-2026",
      inherits_from: null,
      cumulative: true,
      generated_from: { curriculum: "fixture-curriculum", method: "agent-role-assignment" },
      required_leveling: { frequency_list: "ngsl-1.2" },
      modules: { m1: ["name"], m2: ["age"] },
      taught_through: "m2",
    });

    const knownViaM1 = resolveKnownVocabulary("grade-5-2026@m1", repoRoot);
    const knownViaM2 = resolveKnownVocabulary("grade-5-2026@m2", repoRoot);
    expect(knownViaM1).toEqual(knownViaM2);
  });
});
