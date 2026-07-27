import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { handleLessonPreviewRequest } from "./lessonPreview.ts";

const FIXTURE_REPO_ROOT = new URL("../fixtures/repo/", import.meta.url)
  .pathname;

describe("handleLessonPreviewRequest (HTTP)", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer((req, res) => {
      void handleLessonPreviewRequest(req, res, {
        repoRoot: FIXTURE_REPO_ROOT,
      });
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

  it("returns 400 when class or date is missing", async () => {
    const res = await fetch(
      `${baseUrl}/api/lesson-preview?class=fixture-class`,
    );
    expect(res.status).toBe(400);
  });

  it("returns the teaching-day context for a valid class + date", async () => {
    const res = await fetch(
      `${baseUrl}/api/lesson-preview?class=fixture-class&date=2026-08-03`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isTeachingDay).toBe(true);
    expect(body.moduleId).toBe("m1");
    expect(Array.isArray(body.gaps)).toBe(true);
  });

  it("returns the non-teaching-day context for a weekend", async () => {
    const res = await fetch(
      `${baseUrl}/api/lesson-preview?class=fixture-class&date=2026-08-08`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isTeachingDay).toBe(false);
    expect(typeof body.reason).toBe("string");
  });

  it("returns 500 for an unknown class", async () => {
    const res = await fetch(
      `${baseUrl}/api/lesson-preview?class=nonexistent-class&date=2026-08-03`,
    );
    expect(res.status).toBe(500);
  });
});
