import type { CalendarEvent } from "@svar-ui/react-calendar";
import type { Appointment, ModuleTask } from "./api.ts";
import { worstGapSeverity } from "./calendarMapping.ts";

/** Wired via `Calendar.tsx`'s `tooltip` prop -- SVAR shows this on hover, independently of
 * `eventPopup`'s click handling (separate hover-driven state internally), so it's a pure
 * additive summary rather than a substitute for the click-through popup. */
export function EventTooltip({ event }: { event: CalendarEvent }) {
  const task = (event as CalendarEvent & { task?: ModuleTask }).task;
  const appointment = (event as CalendarEvent & { appointment?: Appointment })
    .appointment;

  if (task) {
    const gap = worstGapSeverity(task);
    return (
      <div className="companion-tooltip">
        <div className="companion-tooltip-title">{task.moduleTitle}</div>
        <div className="companion-tooltip-row">{task.classLabel}</div>
        <div className="companion-tooltip-row">
          {task.startDate} – {task.endDate}
        </div>
        <div className="companion-tooltip-row">
          Coverage: {task.coveragePercent}%{gap && <> · {gap}</>}
        </div>
      </div>
    );
  }

  if (appointment) {
    const hasHomework = appointment.materials.some((m) => m.type === "homework");
    const hasTest = appointment.materials.some((m) => m.type === "test");
    return (
      <div className="companion-tooltip">
        <div className="companion-tooltip-title">
          {appointment.lessonTopic ?? appointment.moduleTitle}
        </div>
        <div className="companion-tooltip-row">
          {appointment.classLabel} · {appointment.date}
        </div>
        {(hasHomework || hasTest) && (
          <div className="companion-tooltip-row">
            {hasHomework && "Homework"}
            {hasHomework && hasTest && " · "}
            {hasTest && "Test"}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="companion-tooltip">
      <div className="companion-tooltip-title">{String(event.text ?? "")}</div>
    </div>
  );
}
