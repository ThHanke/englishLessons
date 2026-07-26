import type { CalendarRangeResponse } from '../server/routes/calendar.ts';

export type { CalendarRangeResponse, CalendarDayResponse } from '../server/routes/calendar.ts';

/** `GET /api/calendar?class=<className>&from=<from>&to=<to>` — the response shape is imported
 * directly from the server route module so the two ends can never drift apart. */
export async function fetchCalendarRange(params: {
  baseUrl: string;
  className: string;
  from: string;
  to: string;
}): Promise<CalendarRangeResponse> {
  const { baseUrl, className, from, to } = params;
  const url = new URL('/api/calendar', baseUrl);
  url.searchParams.set('class', className);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`GET /api/calendar failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as CalendarRangeResponse;
}
