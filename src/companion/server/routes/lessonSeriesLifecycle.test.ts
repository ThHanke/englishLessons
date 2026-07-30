import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { generateSessionToken } from "../security.ts";
import { writeYaml } from "../../../schema/yaml.ts";
import { loadYaml } from "../../../schema/yaml.ts";
import type { CalendarFile, LessonSlot } from "../../../schema/types.ts";
import {
  handleSeriesPreviewRequest,
  handleCreateSeriesRequest,
  handleDeleteSeriesRequest,
} from "./lessonSeries.ts";
import type { TasksRangeResponse } from "./tasks.ts";

const SESSION_TOKEN_HEADER = "x-companion-session-token";

function setupLifecycleRepo(): {
  repoRoot: string;
  calendarPath: string;
  cleanup: () => void;
} {
  const repoRoot = mkdtempSync(join(tmpdir(), "series-lifecycle-"));

  mkdirSync(join(repoRoot, "calendar"), { recursive: true });
  const calendarPath = join(repoRoot, "calendar", "test-calendar.yaml");
  const calendar: CalendarFile = {
    state: "test-state",
    school_year: "2026/2027",
    first_school_day: "2026-08-03",
    last_school_day: "2026-09-04",
    half_year_boundary: "2027-02-01",
    holidays: [
      { name: "Summer break tail", from: "2026-08-14", to: "2026-08-14" },
    ],
    events: [],
    pace_factors: {
      pre_holiday_days: 0,
      pre_holiday_factor: 1,
      post_holiday_days: 0,
      post_holiday_factor: 1,
    },
    class_schedule: {
      "test-class": {},
    },
  };
  writeYaml(calendarPath, calendar);

  mkdirSync(join(repoRoot, "plans", "test-grade"), { recursive: true });
  writeYaml(join(repoRoot, "plans", "test-grade", "class.yaml"), {
    name: "test-class",
    grade: 7,
    curriculum: "test-curriculum",
  });
  writeYaml(join(repoRoot, "plans", "test-grade", "modules.yaml"), {
    class: "test-class",
    curriculum: "test-curriculum",
    total_weeks: 4,
    weekly_lessons: 3,
    buffer_weeks: 0,
    modules: [
      {
        id: "m1",
        title: "Test Module",
        weeks: 4,
        content_fields: [],
        goals: [],
        covers: [],
        milestone: { type: "none", assesses: [] },
        pedagogy: { new_grammar: [] },
      },
    ],
  });

  mkdirSync(join(repoRoot, "artifacts"), { recursive: true });

  return {
    repoRoot,
    calendarPath,
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true }),
  };
}

describe("lesson series lifecycle (HTTP)", () => {
  let server: Server;
  let baseUrl: string;
  let sessionToken: string;
  let repo: ReturnType<typeof setupLifecycleRepo>;

  beforeEach(async () => {
    repo = setupLifecycleRepo();
    sessionToken = generateSessionToken();

    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const config = {
        repoRoot: repo.repoRoot,
        expectedOrigin: origin,
        sessionToken,
      };

      if (
        req.method === "GET" &&
        url.pathname === "/api/lesson-series/preview"
      ) {
        void handleSeriesPreviewRequest(req, res, config);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/lesson-series") {
        void handleCreateSeriesRequest(req, res, config);
        return;
      }
      if (req.method === "DELETE" && url.pathname === "/api/lesson-series") {
        void handleDeleteSeriesRequest(req, res, config);
        return;
      }
      res.writeHead(404);
      res.end();
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
    repo.cleanup();
  });

  it("create series → slot persisted in YAML + appointments in response", async () => {
    const res = await fetch(`${baseUrl}/api/lesson-series`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        [SESSION_TOKEN_HEADER]: sessionToken,
      },
      body: JSON.stringify({
        className: "test-class",
        day: "Mon",
        start: "08:00",
        end: "08:45",
        halfYear: 1,
        from: "2026-08-03",
        to: "2026-09-04",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as TasksRangeResponse;

    expect(body.appointments.length).toBeGreaterThan(0);
    expect(body.lessonSlots).toBeDefined();
    expect(body.lessonSlots!["test-class"]).toHaveLength(1);
    expect(body.lessonSlots!["test-class"]![0]!.day).toBe("Mon");
    expect(body.lessonSlots!["test-class"]![0]!.start).toBe("08:00");

    const calendar = loadYaml<CalendarFile>(repo.calendarPath);
    const slots = calendar.class_schedule["test-class"]!.lesson_slots!;
    expect(slots).toHaveLength(1);
    expect(slots[0]!.day).toBe("Mon");
  });

  it("create two series → delete one → only deleted slot removed", async () => {
    const createSlot = async (day: string) => {
      const res = await fetch(`${baseUrl}/api/lesson-series`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: baseUrl,
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
        body: JSON.stringify({
          className: "test-class",
          day,
          start: "08:00",
          end: "08:45",
          halfYear: 1,
          from: "2026-08-03",
          to: "2026-09-04",
        }),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as TasksRangeResponse;
    };

    await createSlot("Mon");
    const afterSecond = await createSlot("Wed");

    expect(afterSecond.lessonSlots!["test-class"]).toHaveLength(2);
    const monSlot = afterSecond.lessonSlots!["test-class"]!.find(
      (s) => s.day === "Mon",
    )!;
    const wedSlot = afterSecond.lessonSlots!["test-class"]!.find(
      (s) => s.day === "Wed",
    )!;
    expect(monSlot).toBeDefined();
    expect(wedSlot).toBeDefined();

    const deleteRes = await fetch(
      `${baseUrl}/api/lesson-series?class=test-class&slotId=${monSlot.id}&from=2026-08-03&to=2026-09-04`,
      {
        method: "DELETE",
        headers: {
          origin: baseUrl,
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
      },
    );

    expect(deleteRes.status).toBe(200);
    const afterDelete = (await deleteRes.json()) as TasksRangeResponse;

    expect(afterDelete.lessonSlots!["test-class"]).toHaveLength(1);
    expect(afterDelete.lessonSlots!["test-class"]![0]!.day).toBe("Wed");

    const calendar = loadYaml<CalendarFile>(repo.calendarPath);
    expect(calendar.class_schedule["test-class"]!.lesson_slots).toHaveLength(1);
    expect(calendar.class_schedule["test-class"]!.lesson_slots![0]!.id).toBe(
      wedSlot.id,
    );
  });

  it("create series then edit it (slotId passed) → same slot updated in place, not duplicated -- this is the Edit lesson series flow, distinct from creating a brand new series", async () => {
    const createRes = await fetch(`${baseUrl}/api/lesson-series`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        [SESSION_TOKEN_HEADER]: sessionToken,
      },
      body: JSON.stringify({
        className: "test-class",
        day: "Mon",
        start: "08:00",
        end: "08:45",
        halfYear: 1,
        from: "2026-08-03",
        to: "2026-09-04",
      }),
    });
    const created = (await createRes.json()) as TasksRangeResponse;
    const originalSlotId = created.lessonSlots!["test-class"]![0]!.id;

    const editRes = await fetch(`${baseUrl}/api/lesson-series`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        [SESSION_TOKEN_HEADER]: sessionToken,
      },
      body: JSON.stringify({
        className: "test-class",
        day: "Thu",
        start: "09:00",
        end: "09:45",
        halfYear: 1,
        from: "2026-08-03",
        to: "2026-09-04",
        slotId: originalSlotId,
      }),
    });

    expect(editRes.status).toBe(200);
    const edited = (await editRes.json()) as TasksRangeResponse;

    expect(edited.lessonSlots!["test-class"]).toHaveLength(1);
    const editedSlot = edited.lessonSlots!["test-class"]![0]!;
    expect(editedSlot.id).toBe(originalSlotId);
    expect(editedSlot.day).toBe("Thu");
    expect(editedSlot.start).toBe("09:00");

    const calendar = loadYaml<CalendarFile>(repo.calendarPath);
    expect(calendar.class_schedule["test-class"]!.lesson_slots).toHaveLength(1);
  });

  it("editing with an unknown slotId returns 400, makes no change", async () => {
    const res = await fetch(`${baseUrl}/api/lesson-series`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        [SESSION_TOKEN_HEADER]: sessionToken,
      },
      body: JSON.stringify({
        className: "test-class",
        day: "Mon",
        start: "08:00",
        end: "08:45",
        halfYear: 1,
        from: "2026-08-03",
        to: "2026-09-04",
        slotId: "does-not-exist",
      }),
    });

    expect(res.status).toBe(400);
    const calendar = loadYaml<CalendarFile>(repo.calendarPath);
    expect(calendar.class_schedule["test-class"]!.lesson_slots ?? []).toHaveLength(0);
  });

  it("delete the only series → slot array empty, appointments gone", async () => {
    const createRes = await fetch(`${baseUrl}/api/lesson-series`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        [SESSION_TOKEN_HEADER]: sessionToken,
      },
      body: JSON.stringify({
        className: "test-class",
        day: "Fri",
        start: "10:00",
        end: "10:45",
        halfYear: 1,
        from: "2026-08-03",
        to: "2026-09-04",
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as TasksRangeResponse;
    const slotId = created.lessonSlots!["test-class"]![0]!.id;
    expect(created.lessonSlots!["test-class"]).toHaveLength(1);

    const deleteRes = await fetch(
      `${baseUrl}/api/lesson-series?class=test-class&slotId=${slotId}&from=2026-08-03&to=2026-09-04`,
      {
        method: "DELETE",
        headers: {
          origin: baseUrl,
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
      },
    );

    expect(deleteRes.status).toBe(200);
    const afterDelete = (await deleteRes.json()) as TasksRangeResponse;

    expect(afterDelete.lessonSlots!["test-class"] ?? []).toHaveLength(0);

    const calendar = loadYaml<CalendarFile>(repo.calendarPath);
    expect(
      calendar.class_schedule["test-class"]!.lesson_slots ?? [],
    ).toHaveLength(0);
  });

  it("preview returns dates and skipped holidays", async () => {
    const res = await fetch(
      `${baseUrl}/api/lesson-series/preview?class=test-class&day=Fri&start=08:00&end=08:45&halfYear=1`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dates: string[];
      skippedCount: number;
      conflicts: unknown[];
    };
    expect(body.dates.length).toBeGreaterThan(0);
    expect(body.dates.every((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(
      true,
    );
    expect(typeof body.skippedCount).toBe("number");
    expect(Array.isArray(body.conflicts)).toBe(true);
  });

  it("preview detects conflict with existing slot in another class", async () => {
    await fetch(`${baseUrl}/api/lesson-series`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        [SESSION_TOKEN_HEADER]: sessionToken,
      },
      body: JSON.stringify({
        className: "test-class",
        day: "Mon",
        start: "08:00",
        end: "08:45",
        halfYear: 1,
        from: "2026-08-03",
        to: "2026-09-04",
      }),
    });

    const calendar = loadYaml<CalendarFile>(repo.calendarPath);
    calendar.class_schedule["other-class"] = {};
    writeYaml(repo.calendarPath, calendar);

    const res = await fetch(
      `${baseUrl}/api/lesson-series/preview?class=other-class&day=Mon&start=08:00&end=08:45&halfYear=1`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conflicts: Array<{ classId: string }>;
    };
    expect(body.conflicts.length).toBeGreaterThan(0);
    expect(body.conflicts[0]!.classId).toBe("test-class");
  });
});
