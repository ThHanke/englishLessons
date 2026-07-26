import type { IncomingMessage, ServerResponse } from 'node:http';
import { moduleTasks } from '../moduleTasks.ts';
import type { Appointment, ClassSummary, ModuleTask } from '../moduleTasks.ts';

export interface TasksRangeResponse {
  from: string;
  to: string;
  classes: ClassSummary[];
  tasks: ModuleTask[];
  appointments: Appointment[];
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * `GET /api/tasks?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` (inclusive range) — the multi-grade
 * overlay's data source (R11): every class's module-spanning tasks in one response, unlike
 * `/api/calendar` which is scoped to one class's per-day grid.
 */
export async function handleTasksRequest(req: IncomingMessage, res: ServerResponse, config: { repoRoot?: string }): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from || !to) {
    sendJson(res, 400, { error: 'missing_query_params', required: ['from', 'to'] });
    return;
  }

  try {
    const { classes, tasks, appointments } = moduleTasks({ from, to, repoRoot: config.repoRoot });
    sendJson(res, 200, { from, to, classes, tasks, appointments } satisfies TasksRangeResponse);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}
