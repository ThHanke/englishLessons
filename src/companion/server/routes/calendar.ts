import type { IncomingMessage, ServerResponse } from 'node:http';
import { addDaysIso } from '../../../schema/dates.ts';
import { dateContext } from '../dateContext.ts';
import type { GapKind } from '../../../coverage/types.ts';

export interface CalendarDayResponse {
  date: string;
  isTeachingDay: boolean;
  moduleId: string | null;
  phase: string | null;
  weekInModule: number | null;
  /** Worst-of the active module's gap kinds for this date, or null when there are no gaps (or
   * it's a non-teaching day). Ranked 'uncovered' < 'under-depth' < 'at-risk'. */
  gapSeverity: GapKind | null;
  gapCount: number;
  /** Set only on non-teaching days (holiday/weekend/outside school year) - `dateContext`'s
   * `NonTeachingDayContext.reason`. */
  reason: string | null;
}

export interface CalendarRangeResponse {
  className: string;
  from: string;
  to: string;
  days: CalendarDayResponse[];
}

const GAP_SEVERITY_RANK: Record<GapKind, number> = {
  uncovered: 0,
  'under-depth': 1,
  'at-risk': 2,
};

function worstGapSeverity(gaps: { kind: GapKind }[]): GapKind | null {
  let worst: GapKind | null = null;
  for (const gap of gaps) {
    if (worst === null || GAP_SEVERITY_RANK[gap.kind] > GAP_SEVERITY_RANK[worst]) {
      worst = gap.kind;
    }
  }
  return worst;
}

/**
 * Builds one `CalendarDayResponse` per calendar day (inclusive) in `[from, to]`, shaping
 * `dateContext`'s per-date union into the flat module/phase/gap-severity fields a calendar UI
 * grid renders directly. Iterates every calendar day, not just teaching days, so weekends/
 * holidays land in the response as `isTeachingDay: false` entries the UI can render distinctly
 * (F4) rather than leaving gaps in the grid.
 */
export function buildCalendarRange(params: {
  className: string;
  from: string;
  to: string;
  repoRoot?: string;
}): CalendarDayResponse[] {
  const { className, from, to, repoRoot } = params;
  const days: CalendarDayResponse[] = [];
  let cursor = from;
  while (cursor <= to) {
    const ctx = dateContext({ className, date: cursor, repoRoot });
    if (ctx.isTeachingDay) {
      days.push({
        date: cursor,
        isTeachingDay: true,
        moduleId: ctx.moduleId,
        phase: ctx.phase,
        weekInModule: ctx.weekInModule,
        gapSeverity: worstGapSeverity(ctx.gaps),
        gapCount: ctx.gaps.length,
        reason: null,
      });
    } else {
      days.push({
        date: cursor,
        isTeachingDay: false,
        moduleId: null,
        phase: null,
        weekInModule: null,
        gapSeverity: null,
        gapCount: 0,
        reason: ctx.reason,
      });
    }
    cursor = addDaysIso(cursor, 1);
  }
  return days;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * `GET /api/calendar?class=<className>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` (inclusive range).
 * Query-param shape chosen for a plain-fetch, no-body GET request the frontend calendar view can
 * cache/refetch by date-range key directly.
 */
export async function handleCalendarRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot?: string },
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const className = url.searchParams.get('class');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!className || !from || !to) {
    sendJson(res, 400, { error: 'missing_query_params', required: ['class', 'from', 'to'] });
    return;
  }

  try {
    const days = buildCalendarRange({ className, from, to, repoRoot: config.repoRoot });
    sendJson(res, 200, { className, from, to, days } satisfies CalendarRangeResponse);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}
