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
  fetchModuleTasks,
} from "./api.ts";
import type {
  Appointment,
  ClassSummary,
  DriftReport,
  ModuleTask,
  TasksRangeResponse,
} from "./api.ts";
import type { Holiday, LessonSlot } from "../../schema/types.ts";
import {
  getSeriesEditorItems,
  defaultHalfYear,
  WEEKDAY_ABBR,
  formatTime,
} from "./seriesEditorItems.tsx";
import type { SeriesFormValues } from "./seriesEditorItems.tsx";
import {
  appointmentEventClass,
  appointmentEventId,
  appointmentToEvent,
  groupColorClass,
  HOLIDAYS_GROUP_ID,
  holidayToEvent,
  taskEventClass,
  taskToEvent,
  toWebcalUrl,
  worstGapSeverity,
} from "./calendarMapping.ts";
import { LessonDetailModal } from "./LessonDetailModal.tsx";

export interface CalendarProps {
  baseUrl: string;
  month: string;
  onOpenChat: (classId: string, date: string, slotId?: string) => void;
  dark?: boolean;
  /** Bump this (e.g. after a chat turn completes) to force a refetch outside of the normal
   * mount/month-navigation triggers -- lets a sibling component signal "data may have changed"
   * without Calendar needing to know why. */
  refreshKey?: number;
  /** When set, fetches this pre-generated JSON once on mount instead of calling
   * `fetchModuleTasks`/`/api/session-token` -- the static GH Pages bundle's data source, since
   * there's no dev server to hit. The session-token fetch still fires and simply fails (already
   * caught below), so `canEdit` stays false automatically with no extra static-mode gating. */
  staticDataUrl?: string;
  /** Which href-builder module `LessonDetailModal` uses for its artifact links -- root-relative
   * `/api/artifacts/...` in dev, page-relative `classes/...` paths in the static bundle. Default
   * `"dev"`. */
  linkMode?: "dev" | "static";
}


export function EventContent({
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
    // Material/plan links used to live here, but a real event box (week/month view) is only
    // wide enough to show the title before `.companion-event-content`'s ellipsis clips
    // everything after it -- those links were present in the DOM but never actually reachable.
    // Double-clicking the appointment now opens LessonDetailModal instead, which has real room
    // for them.
    return (
      <span className="companion-event-content">{appointment.moduleTitle}</span>
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
  refreshKey,
  staticDataUrl,
  linkMode = "dev",
}: CalendarProps) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [tasks, setTasks] = useState<ModuleTask[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [lessonSlots, setLessonSlots] = useState<Record<string, LessonSlot[]>>(
    {},
  );
  const [drift, setDrift] = useState<Record<string, DriftReport>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeClassIds, setActiveClassIds] = useState<
    (string | number)[] | null
  >(null);
  const [selectedTask, setSelectedTask] = useState<ModuleTask | null>(null);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const selectedAppointmentRef = useRef(selectedAppointment);
  selectedAppointmentRef.current = selectedAppointment;
  const [detailModalAppointment, setDetailModalAppointment] =
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
    let cancelled = false;

    // Static bundle: the data is pre-generated for the whole school year (buildSite.ts's
    // calendar-data.json), fetched once on mount rather than re-triggered by month navigation or
    // refreshKey -- there's no dev server behind this to re-query.
    if (staticDataUrl) {
      fetch(staticDataUrl)
        .then((r) => r.json())
        .then((res: TasksRangeResponse) => {
          if (!cancelled) {
            setClasses(res.classes);
            setTasks(res.tasks);
            setAppointments(res.appointments);
            setLessonSlots(res.lessonSlots ?? {});
            setDrift(res.drift ?? {});
            setHolidays(res.holidays ?? []);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }

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
    fetchModuleTasks({ baseUrl, from, to }).then((res) => {
      if (!cancelled) {
        setClasses(res.classes);
        setTasks(res.tasks);
        setAppointments(res.appointments);
        setLessonSlots(res.lessonSlots ?? {});
        setDrift(res.drift ?? {});
        setHolidays(res.holidays ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, month, refreshKey, staticDataUrl]);

  const taskById = useMemo(
    () => new Map(tasks.map((t) => [`${t.classId}::${t.moduleId}`, t])),
    [tasks],
  );
  const appointmentById = useMemo(
    () => new Map(appointments.map((a) => [appointmentEventId(a), a])),
    [appointments],
  );
  const groupOrder = useMemo(() => new Map<string, number>(), []);
  const groups: CalendarGroup[] = useMemo(() => {
    const classGroups = classes.map((c) => {
      const behindBySlots = drift[c.id]?.calendarDrift.behindBySlots ?? 0;
      return {
        id: c.id,
        label: behindBySlots > 0 ? `${c.label} (${behindBySlots} behind)` : c.label,
        css: groupColorClass(c.id, groupOrder),
        active: true,
      };
    });
    if (classGroups.length === 0) return classGroups;
    return [
      ...classGroups,
      { id: HOLIDAYS_GROUP_ID, label: "Holidays", css: "companion-holidays-toggle", active: true },
    ];
  }, [classes, drift, groupOrder]);

  const plannableClassesFirst = useMemo(() => {
    const plannable = new Set(tasks.map((t) => t.classId));
    return [...classes].sort(
      (a, b) => Number(plannable.has(b.id)) - Number(plannable.has(a.id)),
    );
  }, [classes, tasks]);

  const effectiveActiveIds =
    activeClassIds ?? [...classes.map((c) => c.id), HOLIDAYS_GROUP_ID];
  const events = useMemo(
    () => [
      ...tasks
        .filter((t) => effectiveActiveIds.includes(t.classId))
        .map(taskToEvent),
      ...appointments
        .filter((a) => effectiveActiveIds.includes(a.classId))
        .map(appointmentToEvent),
      ...(effectiveActiveIds.includes(HOLIDAYS_GROUP_ID)
        ? holidays.map(holidayToEvent)
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, appointments, holidays, activeClassIds],
  );

  function eventCss(ctx: EventContext): string {
    const event = ctx.event as CalendarEvent & {
      task?: ModuleTask;
      appointment?: Appointment;
    };
    if (event.task) return taskEventClass(event.task, groupOrder);
    if (event.appointment)
      return appointmentEventClass(event.appointment, groupOrder);
    // No task/appointment payload -> a holiday event (holidayToEvent). Reuse the
    // already-defined-but-otherwise-unreferenced dashed/transparent style as the holiday backdrop.
    return "companion-non-teaching";
  }

  const lastClickRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });

  // Extracted from the old double-click handler (which used to open the series Editor directly)
  // so the new LessonDetailModal's "Edit lesson series" button can trigger the exact same
  // seriesFormState/editorData seeding, one click deeper than before.
  function openSeriesEditorFor(appointment: Appointment) {
    if (!canEdit || !calendarApi) return;
    setSelectedAppointment(appointment);
    const store = calendarApi.getStores().data;
    // The double-click handler now explicitly clears editorData (to stop SVAR's own
    // auto-populate from popping the Editor open underneath LessonDetailModal), so by the time
    // this button fires there's no longer a guaranteed pre-existing editorData object to mutate
    // -- build one from the appointment itself (appointmentToEvent's shape) when the store has
    // none, rather than silently no-op-ing.
    const existing = (store.getState() as { editorData?: Record<string, unknown> }).editorData;
    const ed = existing ?? ({ ...appointmentToEvent(appointment) } as Record<string, unknown>);
    const day = appointment.start
      ? WEEKDAY_ABBR[new Date(`${appointment.date}T${appointment.start}:00`).getDay()]!
      : WEEKDAY_ABBR[new Date(`${appointment.date}T00:00:00`).getDay()]!;
    ed.seriesClassName = appointment.classId;
    ed.seriesDay = day;
    ed.seriesStart = appointment.start ?? "";
    ed.seriesEnd = appointment.end ?? "";
    ed.seriesHalfYear = defaultHalfYear(appointment.date);
    ed.seriesRecurring = true;
    store.setState({ editorData: { ...ed } as CalendarEvent });
    setSeriesFormState({
      seriesClassName: appointment.classId,
      seriesDay: day,
      seriesStart: appointment.start ?? "",
      seriesEnd: appointment.end ?? "",
      seriesHalfYear: defaultHalfYear(appointment.date) as 1 | 2,
      seriesRecurring: true,
    });
  }

  function handleSelectEvent(ev: { id: string | number | null }) {
    if (ev.id === null) return;
    const id = String(ev.id);
    const now = Date.now();
    const last = lastClickRef.current;
    const isDoubleClick = last.id === id && now - last.time < 400;
    lastClickRef.current = { id, time: now };

    const task = taskById.get(id);
    if (task) {
      setSelectedTask(task);
      calendarApi?.getStores().data.setState({ editorData: null });
      return;
    }
    const appointment = appointmentById.get(id);
    if (appointment) {
      if (isDoubleClick) {
        // Opens the lesson-detail modal (artifact links + "Edit lesson series" button); the
        // series Editor itself now opens one click deeper, via openSeriesEditorFor. Clearing
        // editorData here matters: SVAR's own event-selection handling auto-populates it on
        // every select-event (including this one), which would otherwise pop the Editor open
        // underneath/alongside this modal even though nothing here asked for it.
        calendarApi?.getStores().data.setState({ editorData: null });
        setDetailModalAppointment(appointment);
      } else {
        // Single click only retargets the planning-panel chat -- Chat.tsx's own pendingSwitch
        // confirmation already guards an active conversation (hasMessagesRef) from being silently
        // swapped out from under the teacher, so clicking around the calendar mid-conversation
        // prompts to confirm rather than losing it.
        calendarApi?.getStores().data.setState({ editorData: null });
        setSelectedTask(null);
        onOpenChat(appointment.classId, appointment.date, appointment.slotId);
      }
    }
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
    // Only delete the temporary event created by the add-event intercept (new series).
    // When editing an existing appointment (selectedAppointmentRef is set), the event
    // is real data — deleting it would remove it from the calendar.
    if (
      state.editorData?.id &&
      state.editorData.seriesDay &&
      !selectedAppointmentRef.current
    ) {
      calendarApi.exec("delete-event", { id: state.editorData.id });
    }
    calendarApi.exec("select-event", { id: null });
    setSelectedAppointment(null);
  }, [calendarApi]);

  const [confirmDelete, setConfirmDelete] = useState<{
    classId: string;
    slotId: string;
  } | null>(null);

  const [calendarsList, setCalendarsList] = useState<
    Array<{ classId: string; classLabel: string; schoolYear: string; icsPath: string }> | null
  >(null);
  const [copiedIcsUrl, setCopiedIcsUrl] = useState<string | null>(null);

  function handleViewCalendars() {
    if (calendarsList !== null) {
      setCalendarsList(null);
      return;
    }
    fetch(new URL("/api/calendars", baseUrl).toString())
      .then((r) => r.json())
      .then((data) => setCalendarsList(data.calendars ?? []))
      .catch(() => setCalendarsList([]));
  }

  function handleCopyIcsUrl(url: string) {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopiedIcsUrl(url);
        setTimeout(() => setCopiedIcsUrl((cur) => (cur === url ? null : cur)), 2000);
      })
      .catch(() => {});
  }

  const handleEditorAction = useCallback(
    async (obj: {
      item: { id?: string | number };
      values: Record<string, unknown>;
      changes: Record<string, unknown>;
    }) => {
      const actionId = obj.item?.id != null ? String(obj.item.id) : undefined;
      if (actionId === "close" || actionId === "cancel") {
        closeEditor();
        return;
      }
      if (actionId === "delete") {
        const fv = seriesFormStateRef.current as Partial<SeriesFormValues>;
        const appt = selectedAppointmentRef.current;
        if (appt?.slotId && fv.seriesClassName) {
          setConfirmDelete({ classId: fv.seriesClassName, slotId: appt.slotId });
        } else {
          closeEditor();
        }
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
            // Editing an existing series keeps its original class -- the picker is disabled in
            // that mode (seriesEditorItems.tsx), so fv.seriesClassName could only differ here if
            // that were bypassed; using the original appointment's classId is the authoritative
            // source either way.
            className: selectedAppointmentRef.current?.classId ?? fv.seriesClassName,
            day: fv.seriesDay,
            start: fv.seriesStart,
            end: fv.seriesEnd,
            halfYear: fv.seriesHalfYear,
            from: viewRange.from,
            to: viewRange.to,
            slotId: selectedAppointmentRef.current?.slotId,
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
        editingExisting: selectedAppointment !== null,
      }),
    [plannableClassesFirst, seriesFormState, baseUrl, selectedAppointment],
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
          text: selectedAppointment !== null ? "Save changes" : "Create series",
          type: "primary" as const,
        },
      ],
    }),
    [selectedAppointment],
  );

  const Theme = dark ? WillowDark : Willow;

  return (
    <Theme>
      <div data-testid="companion-calendar" className="companion-calendar-root">
        <div className="companion-calendar-toolbar-extra">
          {linkMode === "static" ? (
            // Static bundle: no /api/calendars route exists -- calendars/index.html is a real
            // file written alongside this bundle by buildSite.ts, so a plain link is all that's
            // needed (page-relative, resolves under whatever subpath the site is deployed at).
            <a href="calendars/" target="_blank" rel="noopener noreferrer" className="companion-button">
              View calendars
            </a>
          ) : (
            <button
              type="button"
              className="companion-button"
              data-testid="view-calendars-button"
              onClick={handleViewCalendars}
            >
              View calendars
            </button>
          )}
        </div>

        <div className="companion-calendar-grid">
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
        </div>

        {linkMode !== "static" && calendarsList && (
          <div
            role="dialog"
            aria-label="Available calendars"
            data-testid="calendars-list"
            className="companion-modal-overlay"
          >
            <div className="companion-modal-dialog">
              <h2 className="companion-modal-title">Available calendars</h2>
              <p className="companion-modal-subtitle">
                Subscribe to a class's schedule in your own calendar app, or copy the link to add
                it manually.
              </p>
              {calendarsList.length === 0 && <p>No calendars available yet.</p>}
              <ul className="companion-calendars-list">
                {calendarsList.map((c) => {
                  const fullUrl = new URL(c.icsPath, baseUrl).toString();
                  return (
                    <li key={`${c.classId}::${c.schoolYear}`} className="companion-calendars-list-item">
                      <span className="companion-calendars-list-label">
                        {c.classLabel} ({c.schoolYear})
                      </span>
                      <div className="companion-calendars-list-actions">
                        <a href={toWebcalUrl(fullUrl)} className="companion-button companion-button-primary">
                          Subscribe
                        </a>
                        <button
                          type="button"
                          className="companion-button"
                          onClick={() => handleCopyIcsUrl(fullUrl)}
                        >
                          {copiedIcsUrl === fullUrl ? "Copied!" : "Copy link"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="companion-modal-actions">
                <button
                  type="button"
                  className="companion-button"
                  onClick={() => setCalendarsList(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {detailModalAppointment && (
          <LessonDetailModal
            appointment={detailModalAppointment}
            canEdit={canEdit}
            linkMode={linkMode}
            onEditSeries={() => {
              openSeriesEditorFor(detailModalAppointment);
              setDetailModalAppointment(null);
            }}
            onClose={() => setDetailModalAppointment(null)}
          />
        )}

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

        {confirmDelete && (
          <div
            role="alertdialog"
            aria-label="Delete options"
            data-testid="confirm-delete-series"
            className="companion-modal-overlay"
          >
            <div className="companion-modal-dialog">
              <h2 className="companion-modal-title">What do you want to delete?</h2>
              {deleteError && <p style={{ color: "#dc2626" }}>{deleteError}</p>}
              <div className="companion-modal-links">
                <button
                  type="button"
                  className="companion-button"
                  disabled={deletingSlotId !== null}
                  onClick={async () => {
                    setConfirmDelete(null);
                    closeEditor();
                    setSelectedAppointment(null);
                  }}
                >
                  Delete this appointment only
                </button>
                <button
                  type="button"
                  className="companion-button companion-button-danger"
                  disabled={deletingSlotId !== null}
                  onClick={async () => {
                    await handleDeleteSlot(confirmDelete.classId, confirmDelete.slotId);
                    setConfirmDelete(null);
                    closeEditor();
                    setSelectedAppointment(null);
                  }}
                >
                  {deletingSlotId ? "Deleting..." : "Delete entire series"}
                </button>
              </div>
              <div className="companion-modal-actions">
                <button
                  type="button"
                  className="companion-button"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Theme>
  );
}
