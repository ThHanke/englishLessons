import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { handleArtifactsRequest } from "./artifacts.ts";

const FIXTURE_REPO_ROOT = new URL("../fixtures/repo/", import.meta.url)
  .pathname;

describe("handleArtifactsRequest (HTTP)", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer((req, res) => {
      void handleArtifactsRequest(req, res, {
        repoRoot: FIXTURE_REPO_ROOT,
        expectedOrigin: baseUrl,
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

  function get(path: string, origin: string | null = baseUrl) {
    return fetch(`${baseUrl}${path}`, {
      headers: origin !== null ? { origin } : {},
    });
  }

  it("serves a material file with content-type: text/html", async () => {
    const res = await get(
      "/api/artifacts/fixture-class/2026-08-05/materials/gap_fill-fixture.html",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("Fixture material content.");
  });

  it("renders lesson-spec.json through renderLessonPage as HTML, not raw JSON", async () => {
    const res = await get("/api/artifacts/fixture-class/2026-08-05/lesson-spec.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("Module One");
    expect(body).toContain("Fixture Gap Fill");
  });

  it("includes lesson-plan.json's objectives/stages when one exists for the date", async () => {
    const res = await get("/api/artifacts/fixture-class/2026-08-05/lesson-spec.json");
    const body = await res.text();
    expect(body).toContain("Fixture objective one");
    expect(body).toContain("Fixture differentiation notes.");
  });

  it("rejects an unknown class before touching the filesystem", async () => {
    const res = await get("/api/artifacts/not-a-real-class/2026-08-05/lesson-spec.json");
    expect(res.status).toBe(400);
  });

  it("rejects a malformed date", async () => {
    const res = await get("/api/artifacts/fixture-class/not-a-date/lesson-spec.json");
    expect(res.status).toBe(400);
  });

  it("rejects class=.. attempting to relocate the base directory via the whitelist check, not the downstream traversal check", async () => {
    const res = await get("/api/artifacts/../2026-08-05/lesson-spec.json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unknown_class");
  });

  it("rejects a path segment containing ../ (traversal), not a raw file read", async () => {
    const res = await get(
      "/api/artifacts/fixture-class/2026-08-05/..%2f..%2f..%2fetc%2fpasswd",
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_path");
  });

  it("rejects a request with a missing Origin header", async () => {
    const res = await get(
      "/api/artifacts/fixture-class/2026-08-05/materials/gap_fill-fixture.html",
      null,
    );
    expect(res.status).toBe(403);
  });

  it("rejects a request with a mismatched Origin header", async () => {
    const res = await get(
      "/api/artifacts/fixture-class/2026-08-05/materials/gap_fill-fixture.html",
      "http://evil.example.com",
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a well-formed but nonexistent file", async () => {
    const res = await get("/api/artifacts/fixture-class/2026-08-05/materials/does-not-exist.html");
    expect(res.status).toBe(404);
  });
});
