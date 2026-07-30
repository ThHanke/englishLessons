import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { handleCalendarsListRequest, handleCalendarIcsRequest } from "./calendars.ts";
import type { CalendarListing } from "./calendars.ts";

const FIXTURE_REPO_ROOT = new URL("../fixtures/repo/", import.meta.url).pathname;

describe("calendars routes (HTTP)", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/calendars") {
        void handleCalendarsListRequest(req, res, {
          repoRoot: FIXTURE_REPO_ROOT,
          expectedOrigin: baseUrl,
        });
        return;
      }
      void handleCalendarIcsRequest(req, res, {
        repoRoot: FIXTURE_REPO_ROOT,
        expectedOrigin: baseUrl,
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("failed to bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function get(path: string, origin: string | null = baseUrl) {
    return fetch(`${baseUrl}${path}`, { headers: origin !== null ? { origin } : {} });
  }

  describe("GET /api/calendars", () => {
    it("lists every class with lesson_slots defined, with its ics path", async () => {
      const res = await get("/api/calendars");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { calendars: CalendarListing[] };
      const fixtureEntry = body.calendars.find((c) => c.classId === "fixture-class");
      expect(fixtureEntry).toEqual({
        classId: "fixture-class",
        classLabel: expect.any(String),
        schoolYear: "2026/2027",
        icsPath: "/api/calendars/fixture-class/2026-2027.ics",
      });
    });

    it("rejects a mismatched Origin", async () => {
      const res = await get("/api/calendars", "http://evil.example.com");
      expect(res.status).toBe(403);
    });

    it("accepts a missing Origin header (top-level nav case)", async () => {
      const res = await get("/api/calendars", null);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/calendars/:classId/:schoolYear.ics", () => {
    it("generates a valid .ics for a known class/school-year", async () => {
      const res = await get("/api/calendars/fixture-class/2026-2027.ics");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/calendar");
      const body = await res.text();
      expect(body).toContain("BEGIN:VCALENDAR");
      expect(body).toContain("UID:lesson-fixture-class-");
      expect(body).toContain("UID:holiday-");
    });

    it("400s an unknown class", async () => {
      const res = await get("/api/calendars/not-a-real-class/2026-2027.ics");
      expect(res.status).toBe(400);
    });

    it("400s a class with a mismatched school-year slug", async () => {
      const res = await get("/api/calendars/fixture-class/1999-2000.ics");
      expect(res.status).toBe(400);
    });

    it("400s a malformed path", async () => {
      const res = await get("/api/calendars/fixture-class");
      expect(res.status).toBe(400);
    });
  });
});
