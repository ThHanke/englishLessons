import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { Calendar } from './Calendar.tsx';
import type { CalendarDayResponse, CalendarRangeResponse } from './api.ts';
import * as api from './api.ts';

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
  it('renders a teaching day with its module id/label', async () => {
    mockFetch([day({ date: '2026-08-03', moduleId: 'm1', phase: 'new_input' })]);
    render(<Calendar baseUrl="http://127.0.0.1:1" className="grade-7-realschule-2026" month="2026-08-01" onOpenChat={() => {}} />);

    await waitFor(() => expect(screen.getByText('m1')).toBeInTheDocument());
    const cell = screen.getByText('m1').closest('button')!;
    expect(cell).toHaveAttribute('data-module-id', 'm1');
    expect(cell).toHaveAttribute('data-phase', 'new_input');
  });

  it('calls onOpenChat with the correct date when a teaching day is clicked', async () => {
    mockFetch([day({ date: '2026-08-03', moduleId: 'm1' })]);
    const onOpenChat = vi.fn();
    render(<Calendar baseUrl="http://127.0.0.1:1" className="grade-7-realschule-2026" month="2026-08-01" onOpenChat={onOpenChat} />);

    await waitFor(() => screen.getByText('m1'));
    fireEvent.click(screen.getByText('m1').closest('button')!);

    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onOpenChat).toHaveBeenCalledWith('2026-08-03');
  });

  it.each(['uncovered', 'under-depth', 'at-risk'] as const)('shows a distinct indicator for a %s gap', async (kind) => {
    mockFetch([day({ date: '2026-08-03', moduleId: 'm1', gapSeverity: kind, gapCount: 1 })]);
    render(<Calendar baseUrl="http://127.0.0.1:1" className="grade-7-realschule-2026" month="2026-08-01" onOpenChat={() => {}} />);

    await waitFor(() => screen.getByText('m1'));
    const cell = screen.getByText('m1').closest('button')!;
    expect(cell).toHaveAttribute('data-gap-severity', kind);
  });

  it('shows an inline message and does not call onOpenChat when a non-teaching day is clicked', async () => {
    mockFetch([day({ date: '2026-08-01', isTeachingDay: false, reason: 'weekend' })]);
    const onOpenChat = vi.fn();
    render(<Calendar baseUrl="http://127.0.0.1:1" className="grade-7-realschule-2026" month="2026-08-01" onOpenChat={onOpenChat} />);

    await waitFor(() => screen.getByText('1'));
    fireEvent.click(screen.getByText('1').closest('button')!);

    expect(await screen.findByRole('status')).toHaveTextContent('weekend');
    expect(onOpenChat).not.toHaveBeenCalled();
  });

  it('renders without crashing under a dark-mode ancestor', async () => {
    mockFetch([day({ date: '2026-08-03', moduleId: 'm1' })]);
    const { container } = render(
      <div className="dark">
        <Calendar baseUrl="http://127.0.0.1:1" className="grade-7-realschule-2026" month="2026-08-01" onOpenChat={() => {}} />
      </div>,
    );
    await waitFor(() => screen.getByText('m1'));
    expect(container.querySelector('[data-testid="companion-calendar"]')).toBeInTheDocument();
  });
});
