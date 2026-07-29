import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeYaml } from "../../schema/yaml.ts";
import type { ClassFile } from "../../schema/types.ts";
import { rescheduleLesson } from "./rescheduleLesson.ts";

function setupRepo(): { repoRoot: string; cleanup: () => void } {
  const repoRoot = mkdtempSync(join(tmpdir(), "reschedule-lesson-"));

  const classDir = join(repoRoot, "plans", "fixture-grade");
  mkdirSync(classDir, { recursive: true });
  const classFile: ClassFile = {
    name: "test-class",
    grade: 7,
    curriculum: "fixture-curriculum",
  };
  writeYaml(join(classDir, "class.yaml"), classFile);

  const fromDir = join(repoRoot, "artifacts", "test-class", "2026-08-03");
  mkdirSync(join(fromDir, "materials"), { recursive: true });
  writeFileSync(
    join(fromDir, "lesson-spec.json"),
    JSON.stringify({ class: "test-class", date: "2026-08-03", note: "spec" }),
  );
  writeFileSync(
    join(fromDir, "lesson-plan.json"),
    JSON.stringify({ class: "test-class", date: "2026-08-03", note: "plan" }),
  );
  writeFileSync(
    join(fromDir, "manifest.json"),
    JSON.stringify({ class: "test-class", date: "2026-08-03", materials: [] }),
  );
  writeFileSync(join(fromDir, "materials", "gap-fill.html"), "<html></html>");

  const fromSlotDir = join(repoRoot, "artifacts", "test-class", "2026-08-04", "morning");
  mkdirSync(fromSlotDir, { recursive: true });
  writeFileSync(
    join(fromSlotDir, "lesson-spec.json"),
    JSON.stringify({ class: "test-class", date: "2026-08-04", note: "morning spec" }),
  );

  return { repoRoot, cleanup: () => rmSync(repoRoot, { recursive: true, force: true }) };
}

describe("rescheduleLesson", () => {
  let repoRoot: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ repoRoot, cleanup } = setupRepo());
  });

  afterEach(() => cleanup());

  it("moves the artifacts directory and patches the date field in every dated JSON file", () => {
    const result = rescheduleLesson({
      className: "test-class",
      fromDate: "2026-08-03",
      toDate: "2026-08-10",
      repoRoot,
    });

    expect(result).toEqual({ moved: true });

    const oldDir = join(repoRoot, "artifacts", "test-class", "2026-08-03");
    const newDir = join(repoRoot, "artifacts", "test-class", "2026-08-10");
    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(newDir)).toBe(true);
    expect(existsSync(join(newDir, "materials", "gap-fill.html"))).toBe(true);

    for (const filename of ["lesson-spec.json", "lesson-plan.json", "manifest.json"]) {
      const data = JSON.parse(readFileSync(join(newDir, filename), "utf-8"));
      expect(data.date).toBe("2026-08-10");
      expect(data.class).toBe("test-class");
    }
  });

  it("refuses to overwrite a date that already has content", () => {
    const otherDir = join(repoRoot, "artifacts", "test-class", "2026-08-10");
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, "lesson-spec.json"), "{}");

    const result = rescheduleLesson({
      className: "test-class",
      fromDate: "2026-08-03",
      toDate: "2026-08-10",
      repoRoot,
    });

    expect(result.moved).toBe(false);
    expect(result.error).toMatch(/already has content/);
    expect(existsSync(join(repoRoot, "artifacts", "test-class", "2026-08-03"))).toBe(true);
  });

  it("errors when there's nothing to move", () => {
    const result = rescheduleLesson({
      className: "test-class",
      fromDate: "2026-09-01",
      toDate: "2026-09-08",
      repoRoot,
    });

    expect(result).toEqual({
      moved: false,
      error: "No artifacts found for test-class/2026-09-01",
    });
  });

  it("rejects an unknown class before touching the filesystem", () => {
    const result = rescheduleLesson({
      className: "../../etc",
      fromDate: "2026-08-03",
      toDate: "2026-08-10",
      repoRoot,
    });

    expect(result.moved).toBe(false);
    expect(result.error).toMatch(/Unknown class/);
  });

  it("rejects malformed dates", () => {
    const result = rescheduleLesson({
      className: "test-class",
      fromDate: "not-a-date",
      toDate: "2026-08-10",
      repoRoot,
    });

    expect(result.moved).toBe(false);
    expect(result.error).toMatch(/YYYY-MM-DD/);
  });

  it("moves a slot-scoped double-period lesson, keeping the same slot at the new date", () => {
    const result = rescheduleLesson({
      className: "test-class",
      fromDate: "2026-08-04",
      toDate: "2026-08-11",
      slotId: "morning",
      repoRoot,
    });

    expect(result).toEqual({ moved: true });

    const oldDir = join(repoRoot, "artifacts", "test-class", "2026-08-04", "morning");
    const newDir = join(repoRoot, "artifacts", "test-class", "2026-08-11", "morning");
    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(newDir)).toBe(true);
    const data = JSON.parse(readFileSync(join(newDir, "lesson-spec.json"), "utf-8"));
    expect(data.date).toBe("2026-08-11");
  });

  it("does not collide with a different slot already at the destination date", () => {
    const otherSlotDir = join(repoRoot, "artifacts", "test-class", "2026-08-11", "afternoon");
    mkdirSync(otherSlotDir, { recursive: true });
    writeFileSync(join(otherSlotDir, "lesson-spec.json"), "{}");

    const result = rescheduleLesson({
      className: "test-class",
      fromDate: "2026-08-04",
      toDate: "2026-08-11",
      slotId: "morning",
      repoRoot,
    });

    expect(result).toEqual({ moved: true });
    expect(existsSync(otherSlotDir)).toBe(true);
    expect(
      existsSync(join(repoRoot, "artifacts", "test-class", "2026-08-11", "morning")),
    ).toBe(true);
  });

  it("rejects a malformed slotId before touching the filesystem", () => {
    const result = rescheduleLesson({
      className: "test-class",
      fromDate: "2026-08-04",
      toDate: "2026-08-11",
      slotId: "../../etc",
      repoRoot,
    });

    expect(result.moved).toBe(false);
    expect(result.error).toMatch(/Invalid slotId/);
  });
});
