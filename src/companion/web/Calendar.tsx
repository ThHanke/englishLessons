import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Calendar as SvarCalendar, CalendarPanel, Editor, Willow, WillowDark } from '@svar-ui/react-calendar';
import type { CalendarGroup, CalendarInstanceApi, EventContext, CalendarEvent, EventContentMode } from '@svar-ui/react-calendar';
import type { StoreActions } from '@svar-ui/calendar-store';
import '@svar-ui/react-calendar/all.css';
import { createLessonSeries, deleteLessonSeries, fetchLessonPreview, fetchModuleTasks } from './api.ts';
import type { Appointment, ClassSummary, DateContext, ModuleTask, TasksRangeResponse } from './api.ts';
import type { LessonSlot } from '../../schema/types.ts';
import { getSeriesEditorItems, defaultHalfYear, WEEKDAY_ABBR, formatTime } from './seriesEditorItems.tsx';
import type { SeriesFormValues } from './seriesEditorItems.tsx';
import {
  appointmentEventClass,
  appointmentToEvent,
  groupColorClass,
  taskEventClass,
  taskToEvent,
  worstGapSeverity,
} from './calendarMapping.ts';

export interface CalendarProps {
  baseUrl: string;
  /** `YYYY-MM-01` — any date within the month to render. */
  month: string;
  /** Grade chosen in the "Plan lesson" form, plus the day that was hovered/clicked (R11). */
  onOpenChat: (classId: string, date: string) => void;
  /** Renders the Willow-dark theme instead of the light one. */
  dark?: boolean;
}

/** Small non-library grade+date picker, the "Plan lesson" entry point (R11). Collects both
 * fields: the calendar's own "add" trigger (the toolbar `+` button, per KTD — month view here has
 * no per-cell hover affordance to prefill a date from, confirmed by probing a live build) doesn't
 * hand us a date, and a day can now hold multiple grades' modules at once, so neither field can be
 * inferred from where the button was clicked. Once both fields are set, previews the same seed
 * context R2's chat-open flow would assemble (`GET /api/lesson-preview`), so the teacher sees
 * what they're about to open before committing to it.
 */
function PlanLessonForm({
  initialDate,
  baseUrl,
  classes,
  onCancel,
  onSubmit,
}: {
  initialDate: string;
  baseUrl: string;
  classes: ClassSummary[];
  onCancel: () => void;
  onSubmit: (classId: string, date: string) => void;
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [date, setDate] = useState(initialDate);
  const [preview, setPreview] = useState<DateContext | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!classId || !date) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewError(null);
    fetchLessonPreview({ baseUrl, className: classId, date }).then(
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
  }, [baseUrl, classId, date]);

  const canSubmit = !!classId && !!date && preview?.isTeachingDay === true;

  return (
    <div role="dialog" aria-label="Plan lesson" data-testid="plan-lesson-form">
      <p>Plan a lesson</p>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        Grade
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {previewError && <p data-testid="plan-lesson-preview-error">{previewError}</p>}
      {preview && preview.isTeachingDay && (
        <div data-testid="plan-lesson-preview">
          <p>
            Module {preview.moduleId} — week {preview.weekInModule}, {preview.phase}
          </p>
          <p>{preview.gaps.length === 0 ? 'No coverage gaps' : `${preview.gaps.length} coverage gap(s)`}</p>
          <p>{preview.lessonSpec ? `Existing lesson-spec: ${preview.lessonSpecPath}` : 'No lesson-spec planned yet for this date'}</p>
        </div>
      )}
      {preview && !preview.isTeachingDay && (
        <p data-testid="plan-lesson-preview-non-teaching">No lesson can be planned here: {preview.reason}</p>
      )}

      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" disabled={!canSubmit} onClick={() => onSubmit(classId, date)}>
        Plan lesson
      </button>
    </div>
  );
}

/** Preview + open-chat panel for a real scheduled appointment (R11) — unlike `PlanLessonForm`,
 * class and date are already fixed (the appointment itself carries them), so this skips straight
 * to the same seed-context preview, then a single "Open chat" action. */
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
    fetchLessonPreview({ baseUrl, className: appointment.classId, date: appointment.date }).then(
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
    <div role="dialog" aria-label="Lesson preview" data-testid="appointment-preview">
      <p>
        {appointment.classLabel} · {appointment.date} · {appointment.moduleTitle}
      </p>
      {previewError && <p data-testid="appointment-preview-error">{previewError}</p>}
      {preview && preview.isTeachingDay && (
        <>
          <p>
            Week {preview.weekInModule}, {preview.phase}
          </p>
          <p>{preview.gaps.length === 0 ? 'No coverage gaps' : `${preview.gaps.length} coverage gap(s)`}</p>
          <p>{preview.lessonSpec ? `Existing lesson-spec: ${preview.lessonSpecPath}` : 'No lesson-spec planned yet'}</p>
        </>
      )}
      <button type="button" onClick={onClose}>
        Close
      </button>
      <button type="button" onClick={() => onOpenChatForAppointment(appointment.classId, appointment.date)}>
        Open chat
      </button>
    </div>
  );
}

/** Denser chip content than a bare title (the previous build showed only `text`, which the
 * teacher couldn't act on without clicking through) — module title, grade, and either worst gap
 * severity (task bars) or a "planned" mark (appointment chips) in one line: month-view chips are
 * a fixed ~22px tall (confirmed against a live build), too short to stack multiple lines without
 * clipping, so this stays single-line with `text-overflow: ellipsis` and leaves the full
 * breakdown to the click-through detail panels, which already exist. One renderer for both event
 * kinds since `eventContent` is a single calendar-wide prop, not per-event-type. */
function EventContent({ event }: { event: CalendarEvent; mode: EventContentMode }) {
  const task = (event as CalendarEvent & { task?: ModuleTask }).task;
  const appointment = (event as CalendarEvent & { appointment?: Appointment }).appointment;

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

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Defaulting the "Plan lesson" form to `todayIso()` breaks the moment today isn't a real
 * teaching day (weekend/holiday) — the preview then always shows "no lesson can be planned here"
 * and blocks submit. Picks the nearest real appointment date to `reference` instead (on-or-after
 * first, since planning ahead is the common case; falls back to the closest one before it if
 * `reference` is past every known appointment); `todayIso()` only when there are no appointments
 * to anchor to at all (e.g. every class still DRAFT). */
function nearestAppointmentDate(appointments: Appointment[], reference: Date): string {
  if (appointments.length === 0) return todayIso();
  const referenceIso = toIsoDate(reference);
  const dates = [...new Set(appointments.map((a) => a.date))].sort();
  return dates.find((d) => d >= referenceIso) ?? dates[dates.length - 1]!;
}

export function Calendar({ baseUrl, month, onOpenChat, dark = false }: CalendarProps) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [tasks, setTasks] = useState<ModuleTask[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [lessonSlots, setLessonSlots] = useState<Record<string, LessonSlot[]>>({});
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeClassIds, setActiveClassIds] = useState<(string | number)[] | null>(null);
  const [selectedTask, setSelectedTask] = useState<ModuleTask | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  // The date to prefill the "Plan lesson" form with — null means the form is closed. Set from a
  // real drag-selected date (week/day view) when available, otherwise the nearest real
  // appointment date to the currently viewed date (see nearestAppointmentDate).
  const [planLessonInitialDate, setPlanLessonInitialDate] = useState<string | null>(null);
  const [calendarApi, setCalendarApi] = useState<CalendarInstanceApi | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [viewRange, setViewRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [seriesFormState, setSeriesFormState] = useState<Record<string, unknown>>({});
  const seriesFormStateRef = useRef(seriesFormState);
  seriesFormStateRef.current = seriesFormState;
  // The calendar's own navigated-to date (prev/next/today, or a view switch) — tracked here and
  // fed back as `date` so it survives unrelated re-renders (e.g. toggling a CalendarPanel
  // checkbox), instead of snapping back to `month`'s fixed value on every render.
  const [currentDate, setCurrentDate] = useState(() => new Date(`${month.slice(0, 7)}-01T00:00:00`));
  // `init` (below) fires once at mount, so its closure would otherwise capture stale state (e.g.
  // `appointments` still `[]`, before the fetch resolves) — refs let it always read the latest.
  const appointmentsRef = useRef(appointments);
  appointmentsRef.current = appointments;
  const currentDateRef = useRef(currentDate);
  currentDateRef.current = currentDate;

  useEffect(() => {
    fetch(new URL('/api/session-token', baseUrl).toString())
      .then((r) => r.json())
      .then((data) => setSessionToken(data.token))
      .catch(() => {}); // non-fatal — form just won't open without a token
  }, [baseUrl]);

  useEffect(() => {
    // Fetches a generous window around `month` (2 months back, 10 months forward — roughly a
    // full school year) rather than just the one visible month, since in-calendar navigation
    // (prev/next, switching to week/day view) isn't wired to trigger a refetch per move; this
    // keeps ordinary navigation working against already-fetched data instead of going blank.
    const [year, monthNum] = month.slice(0, 7).split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(year, monthNum - 1 - 2, 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(year, monthNum - 1 + 10, 0)).toISOString().slice(0, 10);
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

  const taskById = useMemo(() => new Map(tasks.map((t) => [`${t.classId}::${t.moduleId}`, t])), [tasks]);
  const appointmentById = useMemo(
    () => new Map(appointments.map((a) => [`${a.classId}::${a.moduleId}::${a.date}`, a])),
    [appointments],
  );
  const groupOrder = useMemo(() => new Map<string, number>(), []);
  const groups: CalendarGroup[] = useMemo(
    () => classes.map((c) => ({ id: c.id, label: c.label, css: groupColorClass(c.id, groupOrder), active: true })),
    [classes, groupOrder],
  );

  // A class whose modules.yaml still has DRAFT time fields (KTD7) contributes no tasks (see
  // moduleTasks.ts) and can't be previewed/planned yet — defaulting the Plan-lesson form's grade
  // picker to one of those (e.g. classes[0]) surfaces a raw 500 the moment the form opens.
  // Reordering plannable classes first (never removing the rest — the teacher can still pick a
  // DRAFT-curriculum grade explicitly) fixes the default without hiding anything.
  const plannableClassesFirst = useMemo(() => {
    const plannable = new Set(tasks.map((t) => t.classId));
    return [...classes].sort((a, b) => Number(plannable.has(b.id)) - Number(plannable.has(a.id)));
  }, [classes, tasks]);

  const effectiveActiveIds = activeClassIds ?? classes.map((c) => c.id);
  const events = useMemo(
    () => [
      ...tasks.filter((t) => effectiveActiveIds.includes(t.classId)).map(taskToEvent),
      ...appointments.filter((a) => effectiveActiveIds.includes(a.classId)).map(appointmentToEvent),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveActiveIds is derived per render, comparing by value would thrash
    [tasks, appointments, activeClassIds],
  );

  function eventCss(ctx: EventContext): string {
    const event = ctx.event as CalendarEvent & { task?: ModuleTask; appointment?: Appointment };
    if (event.task) return taskEventClass(event.task, groupOrder);
    if (event.appointment) return appointmentEventClass(event.appointment, groupOrder);
    return '';
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

    const onAddEvent = (action: StoreActions[keyof StoreActions]) => {
      const dragStart = 'event' in action ? (action as { event: { start?: unknown } }).event.start : undefined;
      const dragEnd = 'event' in action ? (action as { event: { end?: unknown } }).event.end : undefined;

      if (dragStart instanceof Date) {
        // Drag-select in day/week view → seed custom properties on the event for the SVAR Editor
        const ev = (action as { event: Record<string, unknown> }).event;
        const dayAbbr = WEEKDAY_ABBR[dragStart.getDay()]!;
        ev.text = 'New lesson series';
        ev.seriesClassName = '';
        ev.seriesDay = dayAbbr;
        ev.seriesStart = formatTime(dragStart);
        ev.seriesEnd = dragEnd instanceof Date ? formatTime(dragEnd) : formatTime(dragStart);
        ev.seriesHalfYear = defaultHalfYear(toIsoDate(dragStart));
        ev.seriesRecurring = true;
        ev._seriesPreview = 0;
        // Seed the form state ref so the preview component picks up initial values
        setSeriesFormState({
          seriesClassName: '',
          seriesDay: dayAbbr,
          seriesStart: ev.seriesStart,
          seriesEnd: ev.seriesEnd,
          seriesHalfYear: ev.seriesHalfYear,
          seriesRecurring: true,
        });
        // Return undefined (not false) — let SVAR create the event and open the Editor
        return undefined;
      }
      // Toolbar + → PlanLessonForm (prevent SVAR default)
      const initialDate = nearestAppointmentDate(appointmentsRef.current, currentDateRef.current);
      setPlanLessonInitialDate(initialDate);
      return false;
    };
    api.intercept('add-event', onAddEvent);
    api.intercept('update-event', () => false);
    api.intercept('move-event', () => false);
  }

  const handleEditorChange = useCallback((obj: { id: string; value: unknown }) => {
    setSeriesFormState(prev => ({ ...prev, [obj.id]: obj.value }));
  }, []);

  const handleEditorAction = useCallback(async (obj: { id: string; values?: Record<string, unknown> }) => {
    if (obj.id === 'close' || obj.id === 'cancel') {
      // Close the editor and delete the temporary event
      if (calendarApi) {
        const state = calendarApi.getState() as { editorData?: { id?: string | number } };
        if (state.editorData?.id) {
          calendarApi.exec('delete-event', { id: state.editorData.id });
        }
        calendarApi.exec('select-event', { id: null });
      }
      return;
    }
    if (obj.id === 'save' || obj.id === 'create') {
      const fv = seriesFormStateRef.current as Partial<SeriesFormValues>;
      if (!fv.seriesClassName || !fv.seriesDay || !fv.seriesStart || !fv.seriesEnd || !fv.seriesHalfYear || !sessionToken) return;
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
        // Error handling — form stays open for retry
        return;
      }
      // Clean up the temporary SVAR event and close editor
      if (calendarApi) {
        const state = calendarApi.getState() as { editorData?: { id?: string | number } };
        if (state.editorData?.id) {
          calendarApi.exec('delete-event', { id: state.editorData.id });
        }
        calendarApi.exec('select-event', { id: null });
      }
    }
  }, [calendarApi, sessionToken, baseUrl, viewRange]);

  async function handleDeleteSlot(classId: string, slotId: string) {
    if (!sessionToken) return;
    setDeletingSlotId(slotId);
    setDeleteError(null);
    try {
      const response = await deleteLessonSeries({
        baseUrl, sessionToken, className: classId, slotId,
        from: viewRange.from, to: viewRange.to,
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
    () => getSeriesEditorItems({ classes: plannableClassesFirst, formState: seriesFormState, baseUrl }),
    [plannableClassesFirst, seriesFormState, baseUrl],
  );

  const seriesBottomBar = useMemo(() => ({
    items: [
      { comp: 'spacer' as const },
      { comp: 'button' as const, id: 'cancel', text: 'Cancel', type: 'default' as const },
      { comp: 'button' as const, id: 'save', text: 'Create series', type: 'primary' as const },
    ],
  }), []);

  const Theme = dark ? WillowDark : Willow;

  return (
    <Theme>
      <div data-testid="companion-calendar" style={{ height: '600px' }}>
        <SvarCalendar
          events={events}
          date={currentDate}
          onNavigateTo={handleNavigateTo}
          view="month"
          views={['day', 'week', 'month']}
          eventCss={eventCss}
          eventContent={EventContent}
          onSelectEvent={handleSelectEvent}
          init={handleInit}
        >
          {groups.length > 0 && <CalendarPanel open calendars={groups} onChange={handlePanelChange} />}
        </SvarCalendar>

        {selectedTask && (
          <div role="status" data-testid="task-detail">
            <p>
              {selectedTask.classLabel}: {selectedTask.moduleTitle} ({selectedTask.startDate} – {selectedTask.endDate})
            </p>
            <p>Gaps: {worstGapSeverity(selectedTask) ?? 'none'} ({selectedTask.gaps.length})</p>
            <p>
              Already planned: {selectedTask.plannedDates.length > 0 ? selectedTask.plannedDates.join(', ') : 'none yet'}
            </p>

            <div data-testid="manage-schedule">
              <p><strong>Schedule</strong></p>
              {deleteError && <p data-testid="delete-error">{deleteError}</p>}
              {(lessonSlots[selectedTask.classId] ?? []).length === 0 && (
                <p>No schedule defined</p>
              )}
              {(lessonSlots[selectedTask.classId] ?? []).map(slot => (
                <div key={slot.id} data-testid={`slot-${slot.id}`}>
                  <span>{slot.day} {slot.start}–{slot.end} (H{slot.half_year})</span>
                  <button
                    type="button"
                    disabled={deletingSlotId === slot.id}
                    onClick={() => handleDeleteSlot(selectedTask.classId, slot.id)}
                  >
                    {deletingSlotId === slot.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>

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

        {planLessonInitialDate && (
          <PlanLessonForm
            initialDate={planLessonInitialDate}
            baseUrl={baseUrl}
            classes={plannableClassesFirst}
            onCancel={() => setPlanLessonInitialDate(null)}
            onSubmit={(classId, date) => {
              onOpenChat(classId, date);
              setPlanLessonInitialDate(null);
            }}
          />
        )}

        {calendarApi && (
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
