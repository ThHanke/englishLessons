import type { IncomingMessage, ServerResponse } from "node:http";
import { moduleTasks } from "../moduleTasks.ts";
import { loadCalendarForClass } from "../loadCalendar.ts";
import { generateClassIcs, schoolYearSlug } from "../../../publish/generateIcs.ts";
import { originMatchesOrAbsent } from "../security.ts";

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export interface CalendarListing {
  classId: string;
  classLabel: string;
  schoolYear: string;
  icsPath: string;
}

/** Every class with at least one recurring `lesson_slots` entry gets a listing -- classes with
 * no schedule defined yet have nothing to subscribe to. Reuses `moduleTasks()`'s already-correct
 * `classes[]` (id + display label) rather than re-deriving it from the `plans` directory; the
 * `from`/`to` range is irrelevant here since `classes[]` is populated independent of it -- a
 * single-day range keeps the call cheap. Follows `routes/artifacts.ts`'s precedent: no caching,
 * this is a low-traffic single-teacher local tool. */
function listCalendars(repoRoot: string): CalendarListing[] {
  const today = new Date().toISOString().slice(0, 10);
  const { classes } = moduleTasks({ from: today, to: today, repoRoot });
  const out: CalendarListing[] = [];
  for (const cls of classes) {
    const calendar = loadCalendarForClass(cls.id, repoRoot);
    if (!calendar) continue;
    const lessonSlots = calendar.class_schedule[cls.id]?.lesson_slots ?? [];
    if (lessonSlots.length === 0) continue;
    out.push({
      classId: cls.id,
      classLabel: cls.label,
      schoolYear: calendar.school_year,
      icsPath: `/api/calendars/${cls.id}/${schoolYearSlug(calendar.school_year)}.ics`,
    });
  }
  return out;
}

/** `GET /api/calendars` -- JSON listing of every class/school-year `.ics` available to subscribe
 * to, so the calendar widget's "View calendars" button has something to render. Read-only, no
 * session token (matches `/api/calendar`/`/api/artifacts`'s existing unauthenticated-read
 * posture); `originMatchesOrAbsent` since this may be reached by a top-level nav, not just fetch. */
export async function handleCalendarsListRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string; expectedOrigin: string },
): Promise<void> {
  const originHeader = req.headers.origin;
  if (
    !originMatchesOrAbsent(
      typeof originHeader === "string" ? originHeader : undefined,
      config.expectedOrigin,
    )
  ) {
    sendJson(res, 403, { error: "origin_rejected" });
    return;
  }
  sendJson(res, 200, { calendars: listCalendars(config.repoRoot) });
}

/** `GET /api/calendars/<classId>/<schoolYearSlug>.ics` -- generates the class's full-year ICS
 * export on the fly (no caching, per the same low-traffic reasoning as above). Validates both
 * `classId` and the school-year slug against the real calendar file (via `loadCalendarForClass`)
 * before generating anything, mirroring `routes/artifacts.ts`'s "whitelist before doing work"
 * discipline -- though unlike that route, there's no filesystem path built from these segments,
 * so there's no traversal risk here, just fast-failing on garbage input with a clean 400. */
export async function handleCalendarIcsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string; expectedOrigin: string },
): Promise<void> {
  const originHeader = req.headers.origin;
  if (
    !originMatchesOrAbsent(
      typeof originHeader === "string" ? originHeader : undefined,
      config.expectedOrigin,
    )
  ) {
    sendJson(res, 403, { error: "origin_rejected" });
    return;
  }

  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname
    .replace(/^\/api\/calendars\//, "")
    .split("/")
    .map((s) => decodeURIComponent(s))
    .filter((s) => s.length > 0);

  if (segments.length !== 2 || !segments[1]!.endsWith(".ics")) {
    sendJson(res, 400, { error: "malformed_path" });
    return;
  }
  const [classId, icsFileName] = segments as [string, string];
  const schoolYearParam = icsFileName.slice(0, -".ics".length);

  const calendar = loadCalendarForClass(classId, config.repoRoot);
  if (!calendar || (calendar.class_schedule[classId]?.lesson_slots ?? []).length === 0) {
    sendJson(res, 400, { error: "unknown_class" });
    return;
  }
  if (schoolYearSlug(calendar.school_year) !== schoolYearParam) {
    sendJson(res, 400, { error: "unknown_school_year" });
    return;
  }

  const { classes } = moduleTasks({
    from: calendar.first_school_day,
    to: calendar.first_school_day,
    repoRoot: config.repoRoot,
  });
  const classLabel = classes.find((c) => c.id === classId)?.label ?? classId;

  const ics = generateClassIcs({ calendar, className: classId, classLabel });
  res.writeHead(200, { "content-type": "text/calendar; charset=utf-8" });
  res.end(ics);
}
