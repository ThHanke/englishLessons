import type { TasksRangeResponse } from '../server/routes/tasks.ts';
import type { DateContext } from '../server/dateContext.ts';

export type { TasksRangeResponse } from '../server/routes/tasks.ts';
export type { ClassSummary, ModuleTask, Appointment } from '../server/moduleTasks.ts';
export type { DateContext, TeachingDayContext, NonTeachingDayContext } from '../server/dateContext.ts';

/** `GET /api/tasks?from=<from>&to=<to>` — the multi-grade overlay's data source (R11). Response
 * shape is imported directly from the server route module so the two ends can never drift apart. */
export async function fetchModuleTasks(params: { baseUrl: string; from: string; to: string }): Promise<TasksRangeResponse> {
  const { baseUrl, from, to } = params;
  const url = new URL('/api/tasks', baseUrl);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`GET /api/tasks failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as TasksRangeResponse;
}

/** `GET /api/lesson-preview?class=<className>&date=<date>` — the same seed context R2's chat-open
 * flow assembles, used by the "Plan lesson" form (R11) to preview a grade+date pick before opening
 * chat for it. */
export async function fetchLessonPreview(params: { baseUrl: string; className: string; date: string }): Promise<DateContext> {
  const { baseUrl, className, date } = params;
  const url = new URL('/api/lesson-preview', baseUrl);
  url.searchParams.set('class', className);
  url.searchParams.set('date', date);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`GET /api/lesson-preview failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as DateContext;
}
