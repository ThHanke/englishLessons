import type { CalendarEvent } from "@svar-ui/react-calendar";
import type { Appointment, ModuleTask } from "./api.ts";
import type { LessonSlot } from "../../schema/types.ts";
import { staticLessonPlanHref, staticHomeworkHref, staticTestHref } from "./staticArtifactHref.ts";
import {
  lessonPlanPageHref,
  homeworkPageHref,
  testPageHref,
  worstGapSeverity,
} from "./calendarMapping.ts";

export interface EventPopupProps {
  event: CalendarEvent;
  close: () => void;
  /** Selects which href-builder module the appointment's artifact links use -- root-relative
   * `/api/artifacts/...` in dev, page-relative `classes/...` paths in the static bundle. */
  linkMode?: "dev" | "static";
  canEdit: boolean;
  onOpenChat: (classId: string, date: string, slotId?: string) => void;
  onEditSeries: (appointment: Appointment) => void;
  lessonSlots: Record<string, LessonSlot[]>;
  deletingSlotId: string | null;
  deleteError: string | null;
  onDeleteSlot: (classId: string, slotId: string) => void;
}

/** Wired via `Calendar.tsx`'s `eventPopup` prop -- SVAR opens this on click (the same
 * mousedown/mouseup gesture that used to dispatch `select-event`; providing `eventPopup` makes
 * SVAR call it instead, so this fully owns "click an event" now, not just the old double-click).
 * Content is per-payload, same branch pattern as `EventContent`: `task` for the whole-module
 * span, `appointment` for a specific planned lesson, neither for a holiday. */
export function EventPopup({
  event,
  close,
  linkMode = "dev",
  canEdit,
  onOpenChat,
  onEditSeries,
  lessonSlots,
  deletingSlotId,
  deleteError,
  onDeleteSlot,
}: EventPopupProps) {
  const task = (event as CalendarEvent & { task?: ModuleTask }).task;
  const appointment = (event as CalendarEvent & { appointment?: Appointment })
    .appointment;

  if (appointment) {
    const hasHomework = appointment.materials.some((m) => m.type === "homework");
    const hasTest = appointment.materials.some((m) => m.type === "test");
    const lessonPlanHref =
      linkMode === "static"
        ? staticLessonPlanHref(appointment.classId, appointment.date, appointment.slotId)
        : lessonPlanPageHref(appointment.classId, appointment.date, appointment.slotId);
    const homeworkHref =
      linkMode === "static"
        ? staticHomeworkHref(appointment.classId, appointment.date, appointment.slotId)
        : homeworkPageHref(appointment.classId, appointment.date, appointment.slotId);
    const testHref =
      linkMode === "static"
        ? staticTestHref(appointment.classId, appointment.date, appointment.slotId)
        : testPageHref(appointment.classId, appointment.date, appointment.slotId);

    return (
      <div className="companion-popup-card" data-testid="event-popup-appointment">
        <h2 className="companion-modal-title">
          {appointment.lessonTopic ?? appointment.moduleTitle}
        </h2>
        <p className="companion-modal-subtitle">
          {appointment.classLabel} &middot; {appointment.date}
          {appointment.start && <> &middot; {appointment.start}–{appointment.end}</>}
          {appointment.lessonTopic && <> &middot; {appointment.moduleTitle}</>}
        </p>
        {appointment.lessonCompetenceTopics && appointment.lessonCompetenceTopics.length > 0 && (
          <p className="companion-modal-subtitle">
            Covers: {appointment.lessonCompetenceTopics.join(", ")}
          </p>
        )}

        {appointment.hasLessonSpec && (
          <div className="companion-modal-links">
            <a href={lessonPlanHref} target="_blank" rel="noopener noreferrer" className="companion-button">
              View lesson plan
            </a>
            {hasHomework && (
              <a href={homeworkHref} target="_blank" rel="noopener noreferrer" className="companion-button">
                View homework
              </a>
            )}
            {hasTest && (
              <a href={testHref} target="_blank" rel="noopener noreferrer" className="companion-button">
                View test
              </a>
            )}
          </div>
        )}

        <div className="companion-modal-actions">
          <button
            type="button"
            className="companion-button"
            onClick={() => {
              onOpenChat(appointment.classId, appointment.date, appointment.slotId);
              close();
            }}
          >
            Open in planning chat
          </button>
          {canEdit && (
            <button
              type="button"
              className="companion-button"
              onClick={() => onEditSeries(appointment)}
            >
              Edit lesson series
            </button>
          )}
          <button type="button" className="companion-button companion-button-primary" onClick={close}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (task) {
    const gap = worstGapSeverity(task);
    return (
      <div className="companion-popup-card" data-testid="event-popup-task">
        <h2 className="companion-modal-title">{task.moduleTitle}</h2>
        <p className="companion-modal-subtitle">
          {task.classLabel} &middot; {task.startDate} – {task.endDate}
        </p>
        <p>
          Gaps: {gap ?? "none"} ({task.gaps.length})
        </p>
        <p>Coverage: {task.coveragePercent}% at required depth</p>
        {task.milestoneType !== "none" && (
          <p>
            {task.milestoneType}
            {task.milestoneDate ? ` on ${task.milestoneDate}` : " (date not yet placed)"}
            {task.milestoneAssesses.length > 0 && ` — assesses ${task.milestoneAssesses.join(", ")}`}
          </p>
        )}
        <p>
          Already planned:{" "}
          {task.plannedDates.length > 0 ? task.plannedDates.join(", ") : "none yet"}
        </p>

        {canEdit && (
          <div data-testid="manage-schedule">
            <p>
              <strong>Schedule</strong>
            </p>
            {deleteError && <p data-testid="delete-error">{deleteError}</p>}
            {(lessonSlots[task.classId] ?? []).length === 0 && <p>No schedule defined</p>}
            {(lessonSlots[task.classId] ?? []).map((slot) => (
              <div key={slot.id} data-testid={`slot-${slot.id}`}>
                <span>
                  {slot.day} {slot.start}–{slot.end} (H{slot.half_year})
                </span>
                <button
                  type="button"
                  disabled={deletingSlotId === slot.id}
                  onClick={() => onDeleteSlot(task.classId, slot.id)}
                >
                  {deletingSlotId === slot.id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="companion-modal-actions">
          <button type="button" className="companion-button companion-button-primary" onClick={close}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="companion-popup-card" data-testid="event-popup-holiday">
      <h2 className="companion-modal-title">{String(event.text ?? "")}</h2>
      <div className="companion-modal-actions">
        <button type="button" className="companion-button companion-button-primary" onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
