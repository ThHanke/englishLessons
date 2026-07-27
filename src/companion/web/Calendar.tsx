import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Calendar as SvarCalendar,
  CalendarPanel,
  Editor,
  Willow,
  WillowDark,
} from "@svar-ui/react-calendar";
import type {
  CalendarGroup,
  CalendarInstanceApi,
  EventContext,
  CalendarEvent,
  EventContentMode,
} from "@svar-ui/react-calendar";
import type { StoreActions } from "@svar-ui/calendar-store";
import "@svar-ui/react-calendar/all.css";
import {
  createLessonSeries,
  deleteLessonSeries,
  fetchLessonPreview,
  fetchModuleTasks,
} from "./api.ts";
import type {
  Appointment,
  ClassSummary,
  DateContext,
  ModuleTask,
  TasksRangeResponse,
} from "./api.ts";
import type { LessonSlot } from "../../schema/types.ts";
import {
  getSeriesEditorItems,
  defaultHalfYear,
  WEEKDAY_ABBR,
  formatTime,
} from "./seriesEditorItems.tsx";
import type { SeriesFormValues } from "./seriesEditorItems.tsx";
import {
  appointmentEventClass,
  appointmentToEvent,
  groupColorClass,
  taskEventClass,
  taskToEvent,
  worstGapSeverity,
} from "./calendarMapping.ts";

export interface CalendarProps {
  baseUrl: string;
  month: string;
  onOpenChat: (classId: string, date: string) => void;
  dark?: boolean;
}

function AppointmentPreview({
  appointment,
  baseUrl,
  onClose,
  onOpenChat: onOpenChatForAppointment,
}: {
  appointment: Appointment;
  baseUrl: string;
  onClose: () => void;
  onOpenChat: (classId: string, date: string) => void;
}) {
  const [preview, setPreview] = useState<DateContext | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLessonPreview({
      baseUrl,
      className: appointment.classId,
      date: appointment.date,
    }).then(
      (ctx) => {
        if (!cancelled) setPreview(ctx);
      },
      (err) => {
        if (!cancelled) setPreviewError((err as Error).message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [baseUrl, appointment.classId, appointment.date]);

  return (
    <div
      role="dialog"
      aria-label="Lesson preview"
      data-testid="appointment-preview"
    >
      <p>
        {appointment.classLabel} · {appointment.date} ·{" "}
        {appointment.moduleTitle}
      </p>
      {previewError && (
        <p data-testid="appointment-preview-error">{previewError}</p>
      )}
      {preview && preview.isTeachingDay && (
        <>
          <p>
            Week {preview.weekInModule}, {preview.phase}
          </p>
          <p>
            {preview.gaps.length === 0
              ? "No coverage gaps"
              : `${preview.gaps.length} coverage gap(s)`}
          </p>
          <p>
            {preview.lessonSpec
              ? `Existing lesson-spec: ${preview.lessonSpecPath}`
              : "No lesson-spec planned yet"}
          </p>
        </>
      )}
      <button type="button" onClick={onClose}>
        Close
      </button>
      <button
        type="button"
        onClick={() =>
          onOpenChatForAppointment(appointment.classId, appointment.date)
        }
      >
        Open chat
      </button>
    </div>
  );
}

function EventContent({
  event,
}: {
  event: CalendarEvent;
  mode: EventContentMode;
}) {
  const task = (event as CalendarEvent & { task?: ModuleTask }).task;
  const appointment = (event as CalendarEvent & { appointment?: Appointment })
    .appointment;

  if (task) {
    const gap = worstGapSeverity(task);
    return (
      <span className="companion-event-content">
        <strong>{task.moduleTitle}</strong> · {task.classLabel}
        {gap && <> · {gap}</>}
      </span>
    );
  }
  if (appointment) {
    return (
      <span className="companion-event-content">
        {appointment.moduleTitle}
        {appointment.hasLessonSpec && <> · planned</>}
      </span>
    );
  }
  return null;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const READONLY_TOOLBAR = {
  items: [
    { id: "nav", comp: "dateNav" as const },
    { id: "today", comp: "todayButton" as const },
    { comp: "spacer" as const },
    { id: "title", comp: "dateLabel" as const },
    { comp: "spacer" as const },
    { id: "modes", comp: "richselect" as const },
  ],
};

export function Calendar({
  baseUrl,
  month,
  onOpenChat,
  dark = false,
}: CalendarProps) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [tasks, setTasks] = useState<ModuleTask[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [lessonSlots, setLessonSlots] = useState<Record<string, LessonSlot[]>>(
    {},
  );
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeClassIds, setActiveClassIds] = useState<
    (string | number)[] | null
  >(null);
  const [selectedTask, setSelectedTask] = useState<ModuleTask | null>(null);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [calendarApi, setCalendarApi] = useState<CalendarInstanceApi | null>(
    null,
  );
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [viewRange, setViewRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [seriesFormState, setSeriesFormState] = useState<
    Record<string, unknown>
  >({});
  const seriesFormStateRef = useRef(seriesFormState);
  seriesFormStateRef.current = seriesFormState;
  const [currentDate, setCurrentDate] = useState(
    () => new Date(`${month.slice(0, 7)}-01T00:00:00`),
  );
  const currentDateRef = useRef(currentDate);
  currentDateRef.current = currentDate;
  const sessionTokenRef = useRef(sessionToken);
  sessionTokenRef.current = sessionToken;

  const canEdit = sessionToken !== null;

  useEffect(() => {
    fetch(new URL("/api/session-token", baseUrl).toString())
      .then((r) => r.json())
      .then((data) => setSessionToken(data.token))
      .catch(() => {});
  }, [baseUrl]);

  useEffect(() => {
    const [year, monthNum] = month.slice(0, 7).split("-").map(Number) as [
      number,
      number,
    ];
    const from = new Date(Date.UTC(year, monthNum - 1 - 2, 1))
      .toISOString()
      .slice(0, 10);
    const to = new Date(Date.UTC(year, monthNum - 1 + 10, 0))
      .toISOString()
      .slice(0, 10);
    setViewRange({ from, to });
    let cancelled = false;
    fetchModuleTasks({ baseUrl, from, to }).then((res) => {
      if (!cancelled) {
        setClasses(res.classes);
        setTasks(res.tasks);
        setAppointments(res.appointments);
        setLessonSlots(res.lessonSlots ?? {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, month]);

  const taskById = useMemo(
    () => new Map(tasks.map((t) => [`${t.classId}::${t.moduleId}`, t])),
    [tasks],
  );
  const appointmentById = useMemo(
    () =>
      new Map(
        appointments.map((a) => [`${a.classId}::${a.moduleId}::${a.date}`, a]),
      ),
    [appointments],
  );
  const groupOrder = useMemo(() => new Map<string, number>(), []);
  const groups: CalendarGroup[] = useMemo(
    () =>
      classes.map((c) => ({
        id: c.id,
        label: c.label,
        css: groupColorClass(c.id, groupOrder),
        active: true,
      })),
    [classes, groupOrder],
  );

  const plannableClassesFirst = useMemo(() => {
    const plannable = new Set(tasks.map((t) => t.classId));
    return [...classes].sort(
      (a, b) => Number(plannable.has(b.id)) - Number(plannable.has(a.id)),
    );
  }, [classes, tasks]);

  const effectiveActiveIds = activeClassIds ?? classes.map((c) => c.id);
  const events = useMemo(
    () => [
      ...tasks
        .filter((t) => effectiveActiveIds.includes(t.classId))
        .map(taskToEvent),
      ...appointments
        .filter((a) => effectiveActiveIds.includes(a.classId))
        .map(appointmentToEvent),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, appointments, activeClassIds],
  );

  function eventCss(ctx: EventContext): string {
    const event = ctx.event as CalendarEvent & {
      task?: ModuleTask;
      appointment?: Appointment;
    };
    if (event.task) return taskEventClass(event.task, groupOrder);
    if (event.appointment)
      return appointmentEventClass(event.appointment, groupOrder);
    return "";
  }

  function handleSelectEvent(ev: { id: string | number | null }) {
    if (ev.id === null) return;
    const id = String(ev.id);
    const task = taskById.get(id);
    if (task) {
      setSelectedTask(task);
      return;
    }
    const appointment = appointmentById.get(id);
    setSelectedAppointment(appointment ?? null);
  }

  function handlePanelChange(ev: { value: (string | number)[] }) {
    setActiveClassIds(ev.value);
  }

  function handleNavigateTo(ev: { date?: Date; view?: string }) {
    if (ev.date) setCurrentDate(ev.date);
  }

  function handleInit(api: CalendarInstanceApi) {
    setCalendarApi(api);

    api.intercept("add-event", (action: StoreActions[keyof StoreActions]) => {
      if (!sessionTokenRef.current) return false;

      const dragStart =
        "event" in action
          ? (action as { event: { start?: unknown } }).event.start
          : undefined;
      const dragEnd =
        "event" in action
          ? (action as { event: { end?: unknown } }).event.end
          : undefined;

      const ev = (action as { event: Record<string, unknown> }).event;
      const now = currentDateRef.current;
      const dayAbbr =
        dragStart instanceof Date
          ? WEEKDAY_ABBR[dragStart.getDay()]!
          : WEEKDAY_ABBR[
              now.getDay() === 0 || now.getDay() === 6 ? 1 : now.getDay()
            ]!;
      const startTime =
        dragStart instanceof Date ? formatTime(dragStart) : "08:00";
      const endTime = dragEnd instanceof Date ? formatTime(dragEnd) : "08:45";
      const refDate =
        dragStart instanceof Date ? toIsoDate(dragStart) : toIsoDate(now);

      ev.text = "New lesson series";
      ev.seriesClassName = "";
      ev.seriesDay = dayAbbr;
      ev.seriesStart = startTime;
      ev.seriesEnd = endTime;
      ev.seriesHalfYear = defaultHalfYear(refDate);
      ev.seriesRecurring = true;
      ev._seriesPreview = 0;

      setSeriesFormState({
        seriesClassName: "",
        seriesDay: dayAbbr,
        seriesStart: startTime,
        seriesEnd: endTime,
        seriesHalfYear: ev.seriesHalfYear as 1 | 2,
        seriesRecurring: true,
      });
      return undefined;
    });
    api.intercept("update-event", () => false);
    api.intercept("move-event", () => false);
    api.intercept("edit-event", (action: StoreActions[keyof StoreActions]) => {
      const ev =
        "event" in action
          ? (action as { event: Record<string, unknown> }).event
          : null;
      if (!ev || !("seriesDay" in ev)) return false;
      return undefined;
    });
  }

  const handleEditorChange = useCallback(
    (obj: { key: string; value: unknown }) => {
      setSeriesFormState((prev) => ({ ...prev, [obj.key]: obj.value }));
    },
    [],
  );

  const closeEditor = useCallback(() => {
    if (!calendarApi) return;
    const state = calendarApi.getState() as {
      editorData?: { id?: string | number; seriesDay?: string };
    };
    if (state.editorData?.id && state.editorData.seriesDay) {
      calendarApi.exec("delete-event", { id: state.editorData.id });
    }
    calendarApi.exec("select-event", { id: null });
  }, [calendarApi]);

  const handleEditorAction = useCallback(
    async (obj: {
      item?: { id: string };
      values?: Record<string, unknown>;
    }) => {
      const actionId = obj.item?.id;
      if (
        actionId === "close" ||
        actionId === "cancel" ||
        actionId === "delete"
      ) {
        closeEditor();
        return;
      }
      if (actionId === "save" || actionId === "create") {
        const fv = seriesFormStateRef.current as Partial<SeriesFormValues>;
        if (
          !fv.seriesClassName ||
          !fv.seriesDay ||
          !fv.seriesStart ||
          !fv.seriesEnd ||
          !fv.seriesHalfYear ||
          !sessionToken
        )
          return;
        try {
          const response = await createLessonSeries({
            baseUrl,
            sessionToken,
            className: fv.seriesClassName,
            day: fv.seriesDay,
            start: fv.seriesStart,
            end: fv.seriesEnd,
            halfYear: fv.seriesHalfYear,
            from: viewRange.from,
            to: viewRange.to,
          });
          setClasses(response.classes);
          setTasks(response.tasks);
          setAppointments(response.appointments);
          setLessonSlots(response.lessonSlots ?? {});
        } catch {
          return;
        }
        closeEditor();
      }
    },
    [closeEditor, sessionToken, baseUrl, viewRange],
  );

  async function handleDeleteSlot(classId: string, slotId: string) {
    if (!sessionToken) return;
    setDeletingSlotId(slotId);
    setDeleteError(null);
    try {
      const response = await deleteLessonSeries({
        baseUrl,
        sessionToken,
        className: classId,
        slotId,
        from: viewRange.from,
        to: viewRange.to,
      });
      setClasses(response.classes);
      setTasks(response.tasks);
      setAppointments(response.appointments);
      setLessonSlots(response.lessonSlots ?? {});
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeletingSlotId(null);
    }
  }

  const seriesEditorItems = useMemo(
    () =>
      getSeriesEditorItems({
        classes: plannableClassesFirst,
        formState: seriesFormState,
        baseUrl,
      }),
    [plannableClassesFirst, seriesFormState, baseUrl],
  );

  const seriesBottomBar = useMemo(
    () => ({
      items: [
        {
          comp: "button" as const,
          id: "delete",
          text: "Delete",
          type: "danger" as const,
        },
        { comp: "spacer" as const },
        {
          comp: "button" as const,
          id: "cancel",
          text: "Cancel",
          type: "default" as const,
        },
        {
          comp: "button" as const,
          id: "save",
          text: "Create series",
          type: "primary" as const,
        },
      ],
    }),
    [],
  );

  const Theme = dark ? WillowDark : Willow;

  return (
    <Theme>
      <div data-testid="companion-calendar" style={{ height: "600px" }}>
        <SvarCalendar
          events={events}
          date={currentDate}
          onNavigateTo={handleNavigateTo}
          view="month"
          views={["day", "week", "month"]}
          toolbar={canEdit ? undefined : READONLY_TOOLBAR}
          eventCss={eventCss}
          eventContent={EventContent}
          onSelectEvent={handleSelectEvent}
          init={handleInit}
        >
          {groups.length > 0 && (
            <CalendarPanel
              open
              calendars={groups}
              onChange={handlePanelChange}
            />
          )}
        </SvarCalendar>

        {selectedTask && (
          <div role="status" data-testid="task-detail">
            <p>
              {selectedTask.classLabel}: {selectedTask.moduleTitle} (
              {selectedTask.startDate} – {selectedTask.endDate})
            </p>
            <p>
              Gaps: {worstGapSeverity(selectedTask) ?? "none"} (
              {selectedTask.gaps.length})
            </p>
            <p>
              Already planned:{" "}
              {selectedTask.plannedDates.length > 0
                ? selectedTask.plannedDates.join(", ")
                : "none yet"}
            </p>

            {canEdit && (
              <div data-testid="manage-schedule">
                <p>
                  <strong>Schedule</strong>
                </p>
                {deleteError && <p data-testid="delete-error">{deleteError}</p>}
                {(lessonSlots[selectedTask.classId] ?? []).length === 0 && (
                  <p>No schedule defined</p>
                )}
                {(lessonSlots[selectedTask.classId] ?? []).map((slot) => (
                  <div key={slot.id} data-testid={`slot-${slot.id}`}>
                    <span>
                      {slot.day} {slot.start}–{slot.end} (H{slot.half_year})
                    </span>
                    <button
                      type="button"
                      disabled={deletingSlotId === slot.id}
                      onClick={() =>
                        handleDeleteSlot(selectedTask.classId, slot.id)
                      }
                    >
                      {deletingSlotId === slot.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => setSelectedTask(null)}>
              Close
            </button>
          </div>
        )}

        {selectedAppointment && (
          <AppointmentPreview
            appointment={selectedAppointment}
            baseUrl={baseUrl}
            onClose={() => setSelectedAppointment(null)}
            onOpenChat={(classId, date) => {
              onOpenChat(classId, date);
              setSelectedAppointment(null);
            }}
          />
        )}

        {canEdit && calendarApi && (
          <Editor
            api={calendarApi}
            items={seriesEditorItems}
            placement="modal"
            autoSave={false}
            topBar={false}
            bottomBar={seriesBottomBar}
            onChange={handleEditorChange}
            onAction={handleEditorAction}
          />
        )}
      </div>
    </Theme>
  );
}
