import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { Calendar } from './Calendar.tsx';
import type { CalendarDayResponse, CalendarRangeResponse } from './api.ts';
import * as api from './api.ts';

/** @svar-ui/react-calendar virtualizes its grid off real pixel measurements (ResizeObserver +
 * getBoundingClientRect), which jsdom's fake ones (vitest.setup.ts) approximate but don't fully
 * replicate — grid-body content (day cells, event chips, click interactions) isn't reliably
 * queryable here. That behavior is covered by calendarMapping.test.ts's pure-function tests
 * instead, plus a manual/scripted check against a real browser (see the plan's own U4
 * verification note: "visual check in a running dev server"). These tests cover what jsdom can
 * actually observe: the component mounts, fetches, and renders its static chrome (CalendarPanel's
 * module legend) without crashing, in both themes. */

afterEach(() => cleanup());

function day(overrides: Partial<CalendarDayResponse> & { date: string }): CalendarDayResponse {
  return {
    isTeachingDay: true,
    moduleId: null,
    phase: null,
    weekInModule: null,
    gapSeverity: null,
    gapCount: 0,
    reason: null,
    ...overrides,
  };
}

function mockFetch(days: CalendarDayResponse[]) {
  const response: CalendarRangeResponse = { className: 'grade-7-realschule-2026', from: days[0]!.date, to: days.at(-1)!.date, days };
  vi.spyOn(api, 'fetchCalendarRange').mockResolvedValue(response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Calendar', () => {
  it('fetches the month range and renders the module legend (CalendarPanel) once data arrives', async () => {
    mockFetch([day({ date: '2026-08-03', moduleId: 'm1', phase: 'new_input' })]);
    render(<Calendar baseUrl="http://127.0.0.1:1" className="grade-7-realschule-2026" month="2026-08-01" onOpenChat={() => {}} />);

    await waitFor(() => expect(screen.getByText('m1')).toBeInTheDocument());
    expect(api.fetchCalendarRange).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:1',
      className: 'grade-7-realschule-2026',
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('renders without crashing in dark mode', async () => {
    mockFetch([day({ date: '2026-08-03', moduleId: 'm1' })]);
    const { container } = render(
      <Calendar baseUrl="http://127.0.0.1:1" className="grade-7-realschule-2026" month="2026-08-01" onOpenChat={() => {}} dark />,
    );
    await waitFor(() => screen.getByText('m1'));
    expect(container.querySelector('[data-testid="companion-calendar"]')).toBeInTheDocument();
  });

  it('renders with no module legend when the month has no teaching days', async () => {
    mockFetch([day({ date: '2026-08-01', isTeachingDay: false, moduleId: null, reason: 'weekend' })]);
    const { container } = render(
      <Calendar baseUrl="http://127.0.0.1:1" className="grade-7-realschule-2026" month="2026-08-01" onOpenChat={() => {}} />,
    );
    await waitFor(() => expect(container.querySelector('[data-testid="companion-calendar"]')).toBeInTheDocument());
    expect(screen.queryByText('m1')).not.toBeInTheDocument();
  });
});
