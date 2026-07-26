import { useEffect, useMemo, useState } from 'react';
import { Calendar as SvarCalendar, CalendarPanel, Willow, WillowDark } from '@svar-ui/react-calendar';
import type { CalendarGroup, EventContext, CalendarEvent } from '@svar-ui/react-calendar';
import '@svar-ui/react-calendar/all.css';
import { fetchCalendarRange } from './api.ts';
import type { CalendarDayResponse } from './api.ts';
import { eventClassFor, moduleColorClass, resolveSelection, toEvent } from './calendarMapping.ts';

export interface CalendarProps {
  baseUrl: string;
  className: string;
  /** `YYYY-MM-01` — any date within the month to render. */
  month: string;
  onOpenChat: (date: string) => void;
  /** Renders the Willow-dark theme instead of the light one (KTD/plan's light/dark requirement). */
  dark?: boolean;
}

export function Calendar({ baseUrl, className, month, onOpenChat, dark = false }: CalendarProps) {
  const [days, setDays] = useState<CalendarDayResponse[]>([]);
  const [nonTeachingMessage, setNonTeachingMessage] = useState<{ date: string; reason: string } | null>(null);
  const [activeModuleIds, setActiveModuleIds] = useState<(string | number)[] | null>(null);

  useEffect(() => {
    // Date.UTC (not the local-time Date constructor) throughout, so the computed range never
    // shifts a day off depending on the browser's local timezone.
    const [year, monthNum] = month.slice(0, 7).split('-').map(Number) as [number, number];
    const from = `${month.slice(0, 7)}-01`;
    const to = new Date(Date.UTC(year, monthNum, 0)).toISOString().slice(0, 10);
    let cancelled = false;
    fetchCalendarRange({ baseUrl, className, from, to }).then((res) => {
      if (!cancelled) setDays(res.days);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, className, month]);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const moduleOrder = useMemo(() => new Map<string, number>(), []);
  const modules: CalendarGroup[] = useMemo(() => {
    const seen = new Map<string, CalendarGroup>();
    for (const d of days) {
      if (d.isTeachingDay && d.moduleId && !seen.has(d.moduleId)) {
        seen.set(d.moduleId, { id: d.moduleId, label: d.moduleId, css: moduleColorClass(d.moduleId, moduleOrder), active: true });
      }
    }
    return [...seen.values()];
  }, [days, moduleOrder]);

  // Every module starts active; once the panel toggles one off, that choice persists across
  // re-fetches (a different month might not even contain the toggled-off module).
  const effectiveActiveIds = activeModuleIds ?? modules.map((m) => m.id);

  const events = useMemo(
    () => days.map(toEvent).filter((ev) => ev.calendarId === undefined || effectiveActiveIds.includes(ev.calendarId as string)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveActiveIds is derived per render, comparing by value would thrash
    [days, activeModuleIds],
  );

  function eventCss(ctx: EventContext): string {
    const day = (ctx.event as CalendarEvent & { day?: CalendarDayResponse }).day as CalendarDayResponse | undefined;
    return day ? eventClassFor(day, moduleOrder) : '';
  }

  function handleSelectEvent(ev: { id: string | number | null }) {
    if (ev.id === null) return;
    const day = byDate.get(String(ev.id));
    if (!day) return;
    const selection = resolveSelection(day);
    if (selection.kind === 'open-chat') {
      setNonTeachingMessage(null);
      onOpenChat(selection.date);
    } else {
      setNonTeachingMessage({ date: selection.date, reason: selection.reason });
    }
  }

  function handlePanelChange(ev: { value: (string | number)[] }) {
    setActiveModuleIds(ev.value);
  }

  const Theme = dark ? WillowDark : Willow;

  return (
    <Theme>
      <div data-testid="companion-calendar" style={{ height: '600px' }}>
        <SvarCalendar
          events={events}
          date={new Date(`${month.slice(0, 7)}-01T00:00:00`)}
          view="month"
          views={['month']}
          readonly
          eventCss={eventCss}
          onSelectEvent={handleSelectEvent}
        >
          {modules.length > 0 && <CalendarPanel open calendars={modules} onChange={handlePanelChange} />}
        </SvarCalendar>
        {nonTeachingMessage && (
          <div role="status" data-testid="non-teaching-message">
            {nonTeachingMessage.reason}
          </div>
        )}
      </div>
    </Theme>
  );
}
