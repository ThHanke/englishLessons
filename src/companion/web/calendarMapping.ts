import type { CalendarEvent } from "@svar-ui/react-calendar";
import type { Appointment, ModuleTask } from "../server/moduleTasks.ts";
import type { GapKind } from "../../coverage/types.ts";

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
    text: task.moduleTitle,
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

/** Display-only default slot (8:00-8:45): the projection engine only knows a module's date range
 * and lesson-count budget, never a real clock time (no per-lesson schedule exists) — this anchors
 * each real teaching-day appointment to a fixed time purely so day/week view has something to
 * render it at; it is not a claim about when the lesson actually happens. */
const APPOINTMENT_HOUR = 8;
const APPOINTMENT_DURATION_MINUTES = 45;

export function appointmentToEvent(appointment: Appointment): CalendarEvent {
  const start = isoDateToLocalDate(appointment.date);
  start.setHours(APPOINTMENT_HOUR, 0, 0, 0);
  const end = new Date(start.getTime() + APPOINTMENT_DURATION_MINUTES * 60_000);
  return {
    id: `${appointment.classId}::${appointment.moduleId}::${appointment.date}`,
    start,
    end,
    allDay: false,
    text: appointment.moduleTitle,
    calendarId: appointment.classId,
    appointment,
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
