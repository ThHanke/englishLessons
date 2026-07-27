import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { buildCalendarRange, handleCalendarRequest } from "./calendar.ts";

const FIXTURE_REPO_ROOT = new URL("../fixtures/repo/", import.meta.url)
  .pathname;

describe("buildCalendarRange", () => {
  it("returns module id, phase, weekInModule, and gap severity per teaching date", () => {
    const days = buildCalendarRange({
      className: "fixture-class",
      from: "2026-08-03",
      to: "2026-08-05",
      repoRoot: FIXTURE_REPO_ROOT,
    });

    const monday = days.find((d) => d.date === "2026-08-03");
    expect(monday?.isTeachingDay).toBe(true);
    expect(monday?.moduleId).toBe("m1");
    expect(monday?.weekInModule).toBe(1);
    expect(monday?.phase).toBe("new_input");
    // c.uncovered (uncovered) and c.underdepth (under-depth) are both m1 gaps on this date;
    // worst-case severity is under-depth (see dateContext.test.ts for the fixture's gap kinds).
    expect(monday?.gapSeverity).toBe("under-depth");
    expect(monday?.reason).toBeNull();
  });

  it("flags a non-teaching day distinctly, with module/phase/gap fields null", () => {
    // 2026-08-08 is a Saturday - not a teaching day.
    const days = buildCalendarRange({
      className: "fixture-class",
      from: "2026-08-08",
      to: "2026-08-08",
      repoRoot: FIXTURE_REPO_ROOT,
    });

    expect(days).toHaveLength(1);
    expect(days[0]!.isTeachingDay).toBe(false);
    expect(days[0]!.moduleId).toBeNull();
    expect(days[0]!.gapSeverity).toBeNull();
    expect(days[0]!.reason).toMatch(
      /holiday, weekend, or outside the school year/,
    );
  });

  it("classifies at-risk as the worst-case severity near a milestone", () => {
    // 2026-08-10 is 2 teaching slots before m1's 2026-08-14 milestone (dateContext.test.ts
    // establishes this crosses into the at-risk window).
    const days = buildCalendarRange({
      className: "fixture-class",
      from: "2026-08-10",
      to: "2026-08-10",
      repoRoot: FIXTURE_REPO_ROOT,
    });

    expect(days[0]!.gapSeverity).toBe("at-risk");
  });

  it("covers the inclusive date range end to end", () => {
    const days = buildCalendarRange({
      className: "fixture-class",
      from: "2026-08-03",
      to: "2026-08-10",
      repoRoot: FIXTURE_REPO_ROOT,
    });

    expect(days.map((d) => d.date)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
  });
});

describe("handleCalendarRequest (HTTP)", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer((req, res) => {
      void handleCalendarRequest(req, res, { repoRoot: FIXTURE_REPO_ROOT });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("failed to bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns whichModule/gapReport-derived data shaped for the calendar UI", async () => {
    const res = await fetch(
      `${baseUrl}/api/calendar?class=fixture-class&from=2026-08-03&to=2026-08-05`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      className: string;
      days: Array<{ date: string; moduleId: string | null }>;
    };
    expect(body.className).toBe("fixture-class");
    expect(body.days).toHaveLength(3);
    expect(body.days[0]!.moduleId).toBe("m1");
  });

  it("responds 400 when a required query param is missing", async () => {
    const res = await fetch(
      `${baseUrl}/api/calendar?class=fixture-class&from=2026-08-03`,
    );
    expect(res.status).toBe(400);
  });
});
