import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitStatusSummary, publishChanges } from "./gitPublish.ts";

const execFile = promisify(execFileCb);

async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFile("git", args, { cwd: repoRoot });
  return stdout;
}

/** A real repo + real bare "origin" in temp dirs, not the project's own repo -- `publishChanges`
 * shells out to real `git`, so this exercises the actual commit/push path end to end without
 * touching the real englishLessons history or requiring network access. */
async function setupFixtureRepo(): Promise<{ repoRoot: string; remoteRoot: string; cleanup: () => void }> {
  const repoRoot = mkdtempSync(join(tmpdir(), "git-publish-repo-"));
  const remoteRoot = mkdtempSync(join(tmpdir(), "git-publish-remote-"));

  await git(remoteRoot, ["init", "--bare", "--initial-branch=main"]);

  await git(repoRoot, ["init", "--initial-branch=main"]);
  await git(repoRoot, ["config", "user.email", "fixture@example.com"]);
  await git(repoRoot, ["config", "user.name", "Fixture Teacher"]);

  mkdirSync(join(repoRoot, "artifacts"), { recursive: true });
  mkdirSync(join(repoRoot, "calendar"), { recursive: true });
  writeFileSync(join(repoRoot, "artifacts", ".gitkeep"), "");
  writeFileSync(join(repoRoot, "calendar", ".gitkeep"), "");
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "initial"]);

  await git(repoRoot, ["remote", "add", "origin", remoteRoot]);
  await git(repoRoot, ["push", "-u", "origin", "main"]);

  return {
    repoRoot,
    remoteRoot,
    cleanup: () => {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(remoteRoot, { recursive: true, force: true });
    },
  };
}

describe("gitStatusSummary", () => {
  let fixture: Awaited<ReturnType<typeof setupFixtureRepo>>;
  beforeEach(async () => {
    fixture = await setupFixtureRepo();
  });
  afterEach(() => fixture.cleanup());

  it("reports no changed files and zero ahead/behind on a clean repo", async () => {
    const summary = await gitStatusSummary(fixture.repoRoot);
    expect(summary.branch).toBe("main");
    expect(summary.changedFiles).toEqual([]);
    expect(summary.ahead).toBe(0);
    expect(summary.behind).toBe(0);
    expect(summary.hasUpstream).toBe(true);
  });

  it("lists a changed file under artifacts/", async () => {
    writeFileSync(join(fixture.repoRoot, "artifacts", "new.json"), "{}");
    const summary = await gitStatusSummary(fixture.repoRoot);
    expect(summary.changedFiles).toEqual(["artifacts/new.json"]);
  });

  it("ignores a changed file outside artifacts/ and calendar/", async () => {
    writeFileSync(join(fixture.repoRoot, "outside.txt"), "hi");
    const summary = await gitStatusSummary(fixture.repoRoot);
    expect(summary.changedFiles).toEqual([]);
  });

  it("reports hasUpstream: false when no upstream is configured", async () => {
    await git(fixture.repoRoot, ["checkout", "-b", "no-upstream"]);
    const summary = await gitStatusSummary(fixture.repoRoot);
    expect(summary.hasUpstream).toBe(false);
  });
});

describe("publishChanges", () => {
  let fixture: Awaited<ReturnType<typeof setupFixtureRepo>>;
  beforeEach(async () => {
    fixture = await setupFixtureRepo();
  });
  afterEach(() => fixture.cleanup());

  it("returns nothing-to-commit when there are no changes", async () => {
    const result = await publishChanges({ repoRoot: fixture.repoRoot, message: "no-op" });
    expect(result).toEqual({ status: "nothing-to-commit" });
  });

  it("returns nothing-to-commit when the only change is outside artifacts/ and calendar/", async () => {
    writeFileSync(join(fixture.repoRoot, "outside.txt"), "hi");
    const result = await publishChanges({ repoRoot: fixture.repoRoot, message: "no-op" });
    expect(result).toEqual({ status: "nothing-to-commit" });
  });

  it("commits and pushes a change under artifacts/, landing it in the remote", async () => {
    writeFileSync(join(fixture.repoRoot, "artifacts", "new.json"), "{}");
    const result = await publishChanges({ repoRoot: fixture.repoRoot, message: "Add new.json" });
    expect(result.status).toBe("published");
    if (result.status !== "published") throw new Error("unreachable");
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);

    const log = await git(fixture.repoRoot, ["log", "-1", "--format=%an <%ae>%n%s%n%b"]);
    expect(log).toContain("Fixture Teacher <fixture@example.com>");
    expect(log).toContain("Add new.json");
    expect(log).not.toContain("Co-Authored-By");

    const remoteLog = await execFile("git", ["log", "-1", "--format=%H", "main"], {
      cwd: fixture.remoteRoot,
    });
    expect(remoteLog.stdout.trim()).toBe(result.commitSha);
  });

  it("returns push-failed (with the commit still made locally) when the remote is unreachable", async () => {
    await git(fixture.repoRoot, ["remote", "set-url", "origin", "/nonexistent/path/does-not-exist.git"]);
    writeFileSync(join(fixture.repoRoot, "calendar", "new.yaml"), "a: 1\n");
    const result = await publishChanges({ repoRoot: fixture.repoRoot, message: "Add calendar entry" });
    expect(result.status).toBe("push-failed");
    if (result.status !== "push-failed") throw new Error("unreachable");
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.error.length).toBeGreaterThan(0);

    const log = await git(fixture.repoRoot, ["log", "-1", "--format=%H"]);
    expect(log.trim()).toBe(result.commitSha);
  });
});
