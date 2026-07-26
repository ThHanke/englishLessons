import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { Calendar } from './Calendar.tsx';
import type { ModuleTask, TasksRangeResponse } from './api.ts';
import * as api from './api.ts';

/** @svar-ui/react-calendar virtualizes its grid off real pixel measurements (ResizeObserver +
 * getBoundingClientRect), which jsdom's fake ones (vitest.setup.ts) approximate but don't fully
 * replicate — grid-body content (day cells, event chips, click/hover interactions) isn't reliably
 * queryable here. That behavior is covered by calendarMapping.test.ts's pure-function tests
 * instead, plus a manual/scripted check against a real browser (see the plan's own U4
 * verification note: "visual check in a running dev server"). These tests cover what jsdom can
 * actually observe: the component mounts, fetches, and renders its static chrome (CalendarPanel's
 * grade legend) without crashing, in both themes. */

afterEach(() => cleanup());

function task(overrides: Partial<ModuleTask> & { classId: string; moduleId: string }): ModuleTask {
  return {
    classLabel: overrides.classId,
    moduleTitle: overrides.moduleId,
    startDate: '2026-08-03',
    endDate: '2026-08-14',
    gaps: [],
    plannedDates: [],
    ...overrides,
  };
}

function mockFetch(classes: TasksRangeResponse['classes'], tasks: ModuleTask[]) {
  const response: TasksRangeResponse = { from: '2026-08-01', to: '2026-08-31', classes, tasks };
  vi.spyOn(api, 'fetchModuleTasks').mockResolvedValue(response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Calendar', () => {
  it('fetches the month range and renders the grade legend (CalendarPanel) once data arrives', async () => {
    mockFetch(
      [{ id: 'grade-7-realschule-2026', label: 'grade-7-realschule-2026' }],
      [task({ classId: 'grade-7-realschule-2026', moduleId: 'm1', moduleTitle: 'Back in school' })],
    );
    render(<Calendar baseUrl="http://127.0.0.1:1" month="2026-08-01" onOpenChat={() => {}} />);

    await waitFor(() => expect(screen.getByText('grade-7-realschule-2026')).toBeInTheDocument());
    expect(api.fetchModuleTasks).toHaveBeenCalledWith({ baseUrl: 'http://127.0.0.1:1', from: '2026-06-01', to: '2027-05-31' });
  });

  it('renders without crashing in dark mode', async () => {
    mockFetch([{ id: 'grade-7-realschule-2026', label: 'grade-7-realschule-2026' }], [task({ classId: 'grade-7-realschule-2026', moduleId: 'm1' })]);
    const { container } = render(<Calendar baseUrl="http://127.0.0.1:1" month="2026-08-01" onOpenChat={() => {}} dark />);
    await waitFor(() => expect(container.querySelector('[data-testid="companion-calendar"]')).toBeInTheDocument());
  });

  it('renders with no grade legend when there are no classes yet', async () => {
    mockFetch([], []);
    const { container } = render(<Calendar baseUrl="http://127.0.0.1:1" month="2026-08-01" onOpenChat={() => {}} />);
    await waitFor(() => expect(container.querySelector('[data-testid="companion-calendar"]')).toBeInTheDocument());
    expect(screen.queryByText('grade-7-realschule-2026')).not.toBeInTheDocument();
  });
});
