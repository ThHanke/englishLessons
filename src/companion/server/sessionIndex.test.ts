import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSessionId,
  getSessionIndexPath,
  setSessionId,
} from "./sessionIndex.ts";
import { getCompanionStateDir } from "./authToken.ts";

const ORIGINAL_ENV = { ...process.env };

function isolateConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "companion-session-index-"));
  process.env.XDG_CONFIG_HOME = dir;
  return dir;
}

describe("sessionIndex", () => {
  let tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDirs = [];
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("resolves the index file to a path outside the repo cwd", () => {
    tmpDirs.push(isolateConfigDir());
    expect(getSessionIndexPath().startsWith(process.cwd())).toBe(false);
  });

  it("returns undefined for a class+date with no stored session", async () => {
    tmpDirs.push(isolateConfigDir());
    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-01" }),
    ).resolves.toBeUndefined();
  });

  it("persists and retrieves a session id for a class+date", async () => {
    tmpDirs.push(isolateConfigDir());
    await setSessionId({
      classId: "grade5a",
      date: "2026-09-01",
      sessionId: "session-1",
    });
    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-01" }),
    ).resolves.toBe("session-1");
  });

  it("keeps two different dates for the same class as distinct entries", async () => {
    tmpDirs.push(isolateConfigDir());
    await setSessionId({
      classId: "grade5a",
      date: "2026-09-01",
      sessionId: "session-mon",
    });
    await setSessionId({
      classId: "grade5a",
      date: "2026-09-03",
      sessionId: "session-wed",
    });

    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-01" }),
    ).resolves.toBe("session-mon");
    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-03" }),
    ).resolves.toBe("session-wed");
  });

  it("does not collide across different classIds on the same date", async () => {
    tmpDirs.push(isolateConfigDir());
    await setSessionId({
      classId: "grade5a",
      date: "2026-09-01",
      sessionId: "session-5a",
    });
    await setSessionId({
      classId: "grade6b",
      date: "2026-09-01",
      sessionId: "session-6b",
    });

    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-01" }),
    ).resolves.toBe("session-5a");
    await expect(
      getSessionId({ classId: "grade6b", date: "2026-09-01" }),
    ).resolves.toBe("session-6b");
  });

  it("keeps two same-day double-period slots for the same class as distinct entries", async () => {
    tmpDirs.push(isolateConfigDir());
    await setSessionId({
      classId: "grade7a",
      date: "2026-09-01",
      slotId: "morning",
      sessionId: "session-morning",
    });
    await setSessionId({
      classId: "grade7a",
      date: "2026-09-01",
      slotId: "afternoon",
      sessionId: "session-afternoon",
    });

    await expect(
      getSessionId({ classId: "grade7a", date: "2026-09-01", slotId: "morning" }),
    ).resolves.toBe("session-morning");
    await expect(
      getSessionId({ classId: "grade7a", date: "2026-09-01", slotId: "afternoon" }),
    ).resolves.toBe("session-afternoon");
  });

  it("serializes two overlapping writes for the same class+date without corrupting the index", async () => {
    tmpDirs.push(isolateConfigDir());

    await Promise.all([
      setSessionId({
        classId: "grade5a",
        date: "2026-09-01",
        sessionId: "session-a",
      }),
      setSessionId({
        classId: "grade5a",
        date: "2026-09-01",
        sessionId: "session-b",
      }),
    ]);

    // The index file must still be well-formed JSON with exactly one value for the key --
    // never an interleaved/partial write from the two concurrent calls.
    const raw = readFileSync(getSessionIndexPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    const stored = await getSessionId({
      classId: "grade5a",
      date: "2026-09-01",
    });
    expect(["session-a", "session-b"]).toContain(stored);
    expect(parsed["grade5a::2026-09-01"]).toBe(stored);
  });

  it("does not crash and starts fresh when the index file on disk is corrupted", async () => {
    const dir = isolateConfigDir();
    tmpDirs.push(dir);
    mkdirSync(getCompanionStateDir(), { recursive: true });
    writeFileSync(getSessionIndexPath(), "{not valid json", "utf8");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-01" }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
