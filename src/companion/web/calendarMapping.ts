import type { CalendarEvent } from "@svar-ui/react-calendar";
import type { Appointment, ModuleTask } from "../server/moduleTasks.ts";
import type { GapKind } from "../../coverage/types.ts";
import type { Holiday } from "../../schema/types.ts";

/** Synthetic `calendarId` for the holidays toggle-layer, reusing `CalendarPanel`'s existing
 * per-`calendarId` checkbox mechanism (today used for per-class show/hide) instead of a new UI
 * component. */
export const HOLIDAYS_GROUP_ID = "holidays";

/** `href`s point at the companion's own local artifact-preview route (KTD6) — same origin as the
 * calendar UI, so a plain root-relative path resolves correctly without needing `baseUrl`.
 * `slotId` mirrors `artifactPath.ts`'s on-disk shape for a double-period class. */
/** `webcal://` is the de-facto standard scheme for calendar subscription links -- browsers/OSes
 * hand a `webcal://` URL off to the user's default calendar app to subscribe, instead of
 * downloading/displaying the raw `.ics` file as plain text (which is what a plain `http(s)://`
 * link does). Same host+path, just a different scheme. */
export function toWebcalUrl(httpUrl: string): string {
  return httpUrl.replace(/^https?:\/\//, "webcal://");
}

export function artifactHref(classId: string, date: string, path: string, slotId?: string): string {
  return slotId
    ? `/api/artifacts/${classId}/${date}/${slotId}/${path}`
    : `/api/artifacts/${classId}/${date}/${path}`;
}

/** Dev-mode href builders for the three-way artifact page split (`routes/artifacts.ts`'s
 * `VARIANT_PAGE_FILENAMES`) -- distinct filenames from `lesson-plan.json` (the raw JSON
 * `fetchLessonPlan` reads) so the two routes don't collide. */
export function lessonPlanPageHref(classId: string, date: string, slotId?: string): string {
  return artifactHref(classId, date, "lesson-plan-page.html", slotId);
}

export function homeworkPageHref(classId: string, date: string, slotId?: string): string {
  return artifactHref(classId, date, "homework-page.html", slotId);
}

export function testPageHref(classId: string, date: string, slotId?: string): string {
  return artifactHref(classId, date, "test-page.html", slotId);
}

/** Deterministic class -> color-slot palette (cycled by first-seen order), so each grade reads as
 * a consistent "overlaying calendar" across the month grid (R11) — a color-slot index, not a
 * per-classId CSS rule, so the stylesheet stays static regardless of how many classes exist. */
export const GROUP_PALETTE_SIZE = 8;

export function groupColorClass(
  classId: string,
  order: Map<string, number>,
): string {
  let index = order.get(classId);
  if (index === undefined) {
    index = order.size % GROUP_PALETTE_SIZE;
    order.set(classId, index);
  }
  return `companion-module-${index}`;
}

/** Gap severity gets a distinct class per kind, ranked uncovered < under-depth < at-risk (matches
 * the server's own ranking) — layered on top of the class color class. */
export const GAP_CLASS: Record<GapKind, string> = {
  uncovered: "companion-gap-uncovered",
  "under-depth": "companion-gap-under-depth",
  "at-risk": "companion-gap-at-risk",
};

const GAP_RANK: Record<GapKind, number> = {
  uncovered: 0,
  "under-depth": 1,
  "at-risk": 2,
};

/** Worst-of a task's gaps, matching the server's own ranking (routes/calendar.ts's
 * `worstGapSeverity`) — the single indicator a spanning task chip can show. */
export function worstGapSeverity(task: ModuleTask): GapKind | null {
  let worst: GapKind | null = null;
  for (const gap of task.gaps) {
    if (worst === null || GAP_RANK[gap.kind] > GAP_RANK[worst])
      worst = gap.kind;
  }
  return worst;
}

/** All-day calendar events must land on the right day in the *browser's local* calendar grid
 * regardless of the machine's UTC offset, so this deliberately uses local-time `Date` construction
 * (not `Date.UTC`) — a UTC-midnight instant displayed in a negative-offset timezone (e.g. US)
 * would render as the *previous* local day, one day early. */
function isoDateToLocalDate(dateIso: string, endOfDay = false): Date {
  const [year, month, day] = dateIso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59)
    : new Date(year, month - 1, day);
}

/** One spanning `CalendarEvent` per module placement (R11) — `start`/`end` are the task's whole
 * date range, not a single day; `calendarId` is the class, so CalendarPanel groups by grade. */
export function taskToEvent(task: ModuleTask): CalendarEvent {
  return {
    id: `${task.classId}::${task.moduleId}`,
    start: isoDateToLocalDate(task.startDate),
    end: isoDateToLocalDate(task.endDate, true),
    allDay: true,
    text: `${task.moduleTitle} (${task.coveragePercent}%)`,
    calendarId: task.classId,
    task,
  };
}

export function taskEventClass(
  task: ModuleTask,
  order: Map<string, number>,
): string {
  const classes = [groupColorClass(task.classId, order)];
  const gap = worstGapSeverity(task);
  if (gap) classes.push(GAP_CLASS[gap]);
  return classes.join(" ");
}

const DEFAULT_HOUR = 8;
const DEFAULT_MINUTE = 0;
const DEFAULT_DURATION_MINUTES = 45;

function parseTime(time: string): [number, number] {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return [h, m];
}

/** Single source of truth for an appointment's `CalendarEvent.id` shape -- also used by
 * `Calendar.tsx`'s `appointmentById` lookup map, so a click handler resolving `ev.id` back to its
 * `Appointment` can never drift out of sync with what `appointmentToEvent` actually assigned. */
export function appointmentEventId(appointment: Appointment): string {
  return `${appointment.classId}::${appointment.moduleId}::${appointment.date}${
    appointment.slotId ? `::${appointment.slotId}` : ""
  }`;
}

export function appointmentToEvent(appointment: Appointment): CalendarEvent {
  const start = isoDateToLocalDate(appointment.date);
  if (appointment.start) {
    const [h, m] = parseTime(appointment.start);
    start.setHours(h, m, 0, 0);
  } else {
    start.setHours(DEFAULT_HOUR, DEFAULT_MINUTE, 0, 0);
  }

  let end: Date;
  if (appointment.end) {
    end = isoDateToLocalDate(appointment.date);
    const [h, m] = parseTime(appointment.end);
    end.setHours(h, m, 0, 0);
  } else {
    end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
  }

  return {
    id: appointmentEventId(appointment),
    start,
    end,
    allDay: false,
    // Once planned, the appointment's actual topic (e.g. "Free time and media") is more useful
    // than the module title, which is identical for every lesson in the module.
    text: appointment.lessonTopic ?? appointment.moduleTitle,
    calendarId: appointment.classId,
    appointment,
  };
}

/** One all-day spanning `CalendarEvent` per holiday, `calendarId: "holidays"` (the synthetic
 * toggle group). Deliberately carries no `task`/`appointment` payload -- `Calendar.tsx`'s
 * `taskById`/`appointmentById` lookups both miss on a holiday event's id, so a click on one
 * silently no-ops without any extra guard code. */
export function holidayToEvent(holiday: Holiday): CalendarEvent {
  return {
    id: `holiday::${holiday.name}::${holiday.from}::${holiday.to}`,
    start: isoDateToLocalDate(holiday.from),
    end: isoDateToLocalDate(holiday.to, true),
    allDay: true,
    text: holiday.name,
    calendarId: HOLIDAYS_GROUP_ID,
  };
}

export function appointmentEventClass(
  appointment: Appointment,
  order: Map<string, number>,
): string {
  const classes = [groupColorClass(appointment.classId, order)];
  if (appointment.hasLessonSpec) classes.push("companion-planned");
  return classes.join(" ");
}
