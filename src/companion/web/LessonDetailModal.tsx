import type { Appointment } from "./api.ts";
import { lessonPlanPageHref, homeworkPageHref, testPageHref } from "./calendarMapping.ts";
import { staticLessonPlanHref, staticHomeworkHref, staticTestHref } from "./staticArtifactHref.ts";

export interface LessonDetailModalProps {
  appointment: Appointment;
  canEdit: boolean;
  /** Selects which href-builder module to use -- root-relative `/api/artifacts/...` in dev,
   * page-relative `classes/...` paths in the static bundle (see `staticArtifactHref.ts`'s doc
   * comment for why these are kept as separate modules rather than one mode-branching function). */
  linkMode?: "dev" | "static";
  onEditSeries: () => void;
  onClose: () => void;
}

/** Opened by double-clicking a planned appointment (`Calendar.tsx`'s `handleSelectEvent`) --
 * links out to the three-way artifact page split (`routes/artifacts.ts`), plus a path to the
 * lesson-series scheduling `Editor` modal (today's double-click behavior, now one click deeper). */
export function LessonDetailModal({
  appointment,
  canEdit,
  linkMode = "dev",
  onEditSeries,
  onClose,
}: LessonDetailModalProps) {
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
    <div
      role="dialog"
      aria-label="Lesson detail"
      data-testid="lesson-detail-modal"
      className="companion-modal-overlay"
    >
      <div className="companion-modal-dialog">
        <h2 className="companion-modal-title">{appointment.moduleTitle}</h2>
        <p className="companion-modal-subtitle">
          {appointment.classLabel} &middot; {appointment.date}
        </p>

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

        <div className="companion-modal-actions">
          {canEdit && (
            <button type="button" className="companion-button" onClick={onEditSeries}>
              Edit lesson series
            </button>
          )}
          <button type="button" className="companion-button companion-button-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
