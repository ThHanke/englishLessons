import { useEffect, useMemo, useState } from 'react';
import { Calendar as SvarCalendar, CalendarPanel, Willow, WillowDark } from '@svar-ui/react-calendar';
import type { CalendarGroup, CalendarInstanceApi, EventContext, CalendarEvent, EventContentMode } from '@svar-ui/react-calendar';
import type { StoreActions } from '@svar-ui/calendar-store';
import '@svar-ui/react-calendar/all.css';
import { fetchLessonPreview, fetchModuleTasks } from './api.ts';
import type { ClassSummary, DateContext, ModuleTask } from './api.ts';
import { groupColorClass, taskEventClass, taskToEvent, worstGapSeverity } from './calendarMapping.ts';

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

/** Denser chip content than a bare title (the previous build showed only `text`, which the
 * teacher couldn't act on without clicking through) — module title, grade, and worst gap
 * severity in one line: month-view bar chips are a fixed ~22px tall (confirmed against a live
 * build), too short to stack multiple lines without clipping, so this stays single-line with
 * `text-overflow: ellipsis` and leaves the full breakdown (including planned-lesson dates) to the
 * click-through task-detail panel, which already exists. */
function TaskEventContent({ event }: { event: CalendarEvent; mode: EventContentMode }) {
  const task = (event as CalendarEvent & { task?: ModuleTask }).task;
  if (!task) return null;
  const gap = worstGapSeverity(task);
  return (
    <span className="companion-event-content">
      <strong>{task.moduleTitle}</strong> · {task.classLabel}
      {gap && <> · {gap}</>}
    </span>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Calendar({ baseUrl, month, onOpenChat, dark = false }: CalendarProps) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [tasks, setTasks] = useState<ModuleTask[]>([]);
  const [activeClassIds, setActiveClassIds] = useState<(string | number)[] | null>(null);
  const [selectedTask, setSelectedTask] = useState<ModuleTask | null>(null);
  const [showPlanLessonForm, setShowPlanLessonForm] = useState(false);
  // The calendar's own navigated-to date (prev/next/today, or a view switch) — tracked here and
  // fed back as `date` so it survives unrelated re-renders (e.g. toggling a CalendarPanel
  // checkbox), instead of snapping back to `month`'s fixed value on every render.
  const [currentDate, setCurrentDate] = useState(() => new Date(`${month.slice(0, 7)}-01T00:00:00`));

  useEffect(() => {
    // Fetches a generous window around `month` (2 months back, 10 months forward — roughly a
    // full school year) rather than just the one visible month, since in-calendar navigation
    // (prev/next, switching to week/day view) isn't wired to trigger a refetch per move; this
    // keeps ordinary navigation working against already-fetched data instead of going blank.
    const [year, monthNum] = month.slice(0, 7).split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(year, monthNum - 1 - 2, 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(year, monthNum - 1 + 10, 0)).toISOString().slice(0, 10);
    let cancelled = false;
    fetchModuleTasks({ baseUrl, from, to }).then((res) => {
      if (!cancelled) {
        setClasses(res.classes);
        setTasks(res.tasks);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, month]);

  const byId = useMemo(() => new Map(tasks.map((t) => [`${t.classId}::${t.moduleId}`, t])), [tasks]);
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
    () => tasks.filter((t) => effectiveActiveIds.includes(t.classId)).map(taskToEvent),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveActiveIds is derived per render, comparing by value would thrash
    [tasks, activeClassIds],
  );

  function eventCss(ctx: EventContext): string {
    const task = (ctx.event as CalendarEvent & { task?: ModuleTask }).task;
    return task ? taskEventClass(task, groupOrder) : '';
  }

  function handleSelectEvent(ev: { id: string | number | null }) {
    if (ev.id === null) return;
    const task = byId.get(String(ev.id));
    setSelectedTask(task ?? null);
  }

  function handlePanelChange(ev: { value: (string | number)[] }) {
    setActiveClassIds(ev.value);
  }

  function handleNavigateTo(ev: { date?: Date; view?: string }) {
    if (ev.date) setCurrentDate(ev.date);
  }

  function handleInit(api: CalendarInstanceApi) {
    // Repurpose the calendar's own "add" affordance (the toolbar `+` button) as the "Plan lesson"
    // entry point (R11) instead of building a parallel trigger: intercepting and cancelling
    // 'add-event' opens our grade+date form instead of letting the library create a real
    // (unpersisted) event. 'update-event'/'move-event' are blocked the same way so dragging a
    // task chip can't locally mutate state that never round-trips to the server anyway.
    // The event-bus's `intercept` types every action name against the full StoreActions union
    // (the `EventBus<StoreActions, keyof StoreActions>` alias @svar-ui/react-calendar builds its
    // public API from), not narrowed per literal action name, so the handler parameter has to
    // accept the union rather than being narrowed via the type system.
    const onAddEvent = (_action: StoreActions[keyof StoreActions]) => {
      setShowPlanLessonForm(true);
      return false;
    };
    api.intercept('add-event', onAddEvent);
    api.intercept('update-event', () => false);
    api.intercept('move-event', () => false);
  }

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
          eventContent={TaskEventContent}
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
            <button type="button" onClick={() => setSelectedTask(null)}>
              Close
            </button>
          </div>
        )}

        {showPlanLessonForm && (
          <PlanLessonForm
            initialDate={todayIso()}
            baseUrl={baseUrl}
            classes={plannableClassesFirst}
            onCancel={() => setShowPlanLessonForm(false)}
            onSubmit={(classId, date) => {
              onOpenChat(classId, date);
              setShowPlanLessonForm(false);
            }}
          />
        )}
      </div>
    </Theme>
  );
}
