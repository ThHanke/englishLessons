import { useEffect, useState } from 'react';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import { fetchCalendarRange } from './api.ts';
import type { CalendarDayResponse } from './api.ts';
import { cn } from './lib/cn.ts';

/** Worst-of gap severity gets a distinct border/badge treatment per kind, ranked
 * uncovered < under-depth < at-risk (matches the server's own ranking in routes/calendar.ts). */
const GAP_SEVERITY_STYLES: Record<'uncovered' | 'under-depth' | 'at-risk', string> = {
  uncovered: 'border-slate-400 dark:border-slate-500',
  'under-depth': 'border-amber-500 dark:border-amber-400',
  'at-risk': 'border-red-600 dark:border-red-500',
};

export interface CalendarProps {
  baseUrl: string;
  className: string;
  /** `YYYY-MM-01` — any date within the month to render. */
  month: string;
  onOpenChat: (date: string) => void;
}

export function Calendar({ baseUrl, className, month, onOpenChat }: CalendarProps) {
  const [days, setDays] = useState<CalendarDayResponse[]>([]);
  const [expandedNonTeachingDay, setExpandedNonTeachingDay] = useState<string | null>(null);

  useEffect(() => {
    const from = format(startOfMonth(new Date(month)), 'yyyy-MM-dd');
    const to = format(endOfMonth(new Date(month)), 'yyyy-MM-dd');
    let cancelled = false;
    fetchCalendarRange({ baseUrl, className, from, to }).then((res) => {
      if (!cancelled) setDays(res.days);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, className, month]);

  const gridDays = eachDayOfInterval({
    start: startOfMonth(new Date(month)),
    end: endOfMonth(new Date(month)),
  });
  const byDate = new Map(days.map((d) => [d.date, d]));

  function handleDayClick(day: CalendarDayResponse) {
    if (day.isTeachingDay) {
      setExpandedNonTeachingDay(null);
      onOpenChat(day.date);
    } else {
      setExpandedNonTeachingDay((current) => (current === day.date ? null : day.date));
    }
  }

  return (
    <div data-testid="companion-calendar" className="grid grid-cols-7 gap-1">
      {gridDays.map((d) => {
        const dateIso = format(d, 'yyyy-MM-dd');
        const day = byDate.get(dateIso);
        if (!day) {
          return (
            <div key={dateIso} data-date={dateIso} className="rounded border border-transparent p-2 text-sm text-muted-foreground" />
          );
        }

        return (
          <div key={dateIso} className="flex flex-col">
            <button
              type="button"
              data-date={day.date}
              data-teaching-day={day.isTeachingDay}
              data-module-id={day.moduleId ?? undefined}
              data-phase={day.phase ?? undefined}
              data-gap-severity={day.gapSeverity ?? undefined}
              onClick={() => handleDayClick(day)}
              className={cn(
                'rounded border p-2 text-left text-sm',
                day.isTeachingDay ? 'border-border bg-card' : 'border-dashed border-muted-foreground/40 text-muted-foreground',
                day.gapSeverity ? GAP_SEVERITY_STYLES[day.gapSeverity] : undefined,
              )}
            >
              <div>{format(d, 'd')}</div>
              {day.isTeachingDay && day.moduleId && (
                <div className="truncate text-xs" title={`${day.moduleId} — ${day.phase}`}>
                  {day.moduleId}
                </div>
              )}
            </button>
            {!day.isTeachingDay && expandedNonTeachingDay === day.date && (
              <div role="status" className="rounded border border-muted-foreground/40 p-1 text-xs text-muted-foreground">
                {day.reason ?? 'No lesson scheduled on this date.'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
