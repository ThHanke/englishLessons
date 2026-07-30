import type { TasksRangeResponse } from "../server/routes/tasks.ts";
import type { DateContext } from "../server/dateContext.ts";
import type { LessonPlan } from "../../publish/renderLessonPage.ts";

export type { TasksRangeResponse } from "../server/routes/tasks.ts";
export type {
  ClassSummary,
  ModuleTask,
  Appointment,
} from "../server/moduleTasks.ts";
export type {
  DateContext,
  TeachingDayContext,
  NonTeachingDayContext,
} from "../server/dateContext.ts";
export type { DriftReport } from "../../coverage/types.ts";
export type { LessonPlan } from "../../publish/renderLessonPage.ts";

/** `GET /api/tasks?from=<from>&to=<to>` — the multi-grade overlay's data source (R11). Response
 * shape is imported directly from the server route module so the two ends can never drift apart. */
export async function fetchModuleTasks(params: {
  baseUrl: string;
  from: string;
  to: string;
}): Promise<TasksRangeResponse> {
  const { baseUrl, from, to } = params;
  const url = new URL("/api/tasks", baseUrl);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`GET /api/tasks failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as TasksRangeResponse;
}

// ---------------------------------------------------------------------------
// Lesson-series endpoints (R12)
// ---------------------------------------------------------------------------

export interface SeriesPreviewResponse {
  dates: string[];
  skippedCount: number;
  conflicts: Array<{
    date: string;
    classId: string;
    start: string;
    end: string;
  }>;
}

/** `GET /api/lesson-series/preview` — preview the recurring dates a lesson-slot would produce. */
export async function fetchSeriesPreview(params: {
  baseUrl: string;
  className: string;
  day: string;
  start: string;
  end: string;
  halfYear: 1 | 2;
}): Promise<SeriesPreviewResponse> {
  const url = new URL("/api/lesson-series/preview", params.baseUrl);
  url.searchParams.set("class", params.className);
  url.searchParams.set("day", params.day);
  url.searchParams.set("start", params.start);
  url.searchParams.set("end", params.end);
  url.searchParams.set("halfYear", String(params.halfYear));
  const res = await fetch(url.toString());
  if (!res.ok)
    throw new Error(
      `GET /api/lesson-series/preview failed: ${res.status} ${res.statusText}`,
    );
  return (await res.json()) as SeriesPreviewResponse;
}

/** `POST /api/lesson-series` — create a recurring lesson-slot and its appointments. */
export async function createLessonSeries(params: {
  baseUrl: string;
  sessionToken: string;
  className: string;
  day: string;
  start: string;
  end: string;
  halfYear: 1 | 2;
  from: string;
  to: string;
  /** When set, updates that existing slot in place (same id) instead of creating a new one --
   * used by the "Edit lesson series" flow so already-planned lessons stay correctly associated. */
  slotId?: string;
}): Promise<TasksRangeResponse> {
  const res = await fetch(
    new URL("/api/lesson-series", params.baseUrl).toString(),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-companion-session-token": params.sessionToken,
      },
      body: JSON.stringify({
        className: params.className,
        day: params.day,
        start: params.start,
        end: params.end,
        halfYear: params.halfYear,
        from: params.from,
        to: params.to,
        slotId: params.slotId,
      }),
    },
  );
  if (!res.ok)
    throw new Error(
      `POST /api/lesson-series failed: ${res.status} ${res.statusText}`,
    );
  return (await res.json()) as TasksRangeResponse;
}

/** `DELETE /api/lesson-series` — remove a lesson-slot and its appointments. */
export async function deleteLessonSeries(params: {
  baseUrl: string;
  sessionToken: string;
  className: string;
  slotId: string;
  from: string;
  to: string;
}): Promise<TasksRangeResponse> {
  const url = new URL("/api/lesson-series", params.baseUrl);
  url.searchParams.set("class", params.className);
  url.searchParams.set("slotId", params.slotId);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { "x-companion-session-token": params.sessionToken },
  });
  if (!res.ok)
    throw new Error(
      `DELETE /api/lesson-series failed: ${res.status} ${res.statusText}`,
    );
  return (await res.json()) as TasksRangeResponse;
}

/** `GET /api/lesson-preview?class=<className>&date=<date>` — the same seed context R2's chat-open
 * flow assembles, used by the "Plan lesson" form (R11) to preview a grade+date pick before opening
 * chat for it. */
export async function fetchLessonPreview(params: {
  baseUrl: string;
  className: string;
  date: string;
  slotId?: string;
}): Promise<DateContext> {
  const { baseUrl, className, date, slotId } = params;
  const url = new URL("/api/lesson-preview", baseUrl);
  url.searchParams.set("class", className);
  url.searchParams.set("date", date);
  if (slotId) url.searchParams.set("slotId", slotId);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      `GET /api/lesson-preview failed: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as DateContext;
}

/** `GET /api/artifacts/<class>/<date>/<slotId?>/lesson-plan.json` -- the structured plan body
 * (objectives/timed stages/differentiation notes) saved by `save_lesson_plan`. A 404 (spec saved
 * but no plan yet) resolves to `null` rather than throwing -- that's a normal in-progress state,
 * not an error. */
export async function fetchLessonPlan(params: {
  baseUrl: string;
  className: string;
  date: string;
  slotId?: string;
}): Promise<LessonPlan | null> {
  const { baseUrl, className, date, slotId } = params;
  const path = slotId
    ? `/api/artifacts/${className}/${date}/${slotId}/lesson-plan.json`
    : `/api/artifacts/${className}/${date}/lesson-plan.json`;

  const res = await fetch(new URL(path, baseUrl).toString());
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as LessonPlan;
}
