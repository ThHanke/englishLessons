// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Calendar, EventContent } from "./Calendar.tsx";
import type { Appointment, ModuleTask, TasksRangeResponse } from "./api.ts";
import type { CalendarEvent } from "@svar-ui/react-calendar";
import * as api from "./api.ts";

/** @svar-ui/react-calendar virtualizes its grid off real pixel measurements (ResizeObserver +
 * getBoundingClientRect), which jsdom's fake ones (vitest.setup.ts) approximate but don't fully
 * replicate — grid-body content (day cells, event chips, click/hover interactions) isn't reliably
 * queryable here. That behavior is covered by calendarMapping.test.ts's pure-function tests
 * instead, plus a manual/scripted check against a real browser (see the plan's own U4
 * verification note: "visual check in a running dev server"). These tests cover what jsdom can
 * actually observe: the component mounts, fetches, and renders its static chrome (CalendarPanel's
 * grade legend) without crashing, in both themes. */

afterEach(() => cleanup());

function task(
  overrides: Partial<ModuleTask> & { classId: string; moduleId: string },
): ModuleTask {
  return {
    classLabel: overrides.classId,
    moduleTitle: overrides.moduleId,
    startDate: "2026-08-03",
    endDate: "2026-08-14",
    gaps: [],
    plannedDates: [],
    ...overrides,
  };
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    classId: "grade-7-realschule-2026",
    classLabel: "grade-7-realschule-2026",
    moduleId: "m1",
    moduleTitle: "Back in school",
    date: "2026-08-05",
    hasLessonSpec: false,
    materials: [],
    ...overrides,
  };
}

function eventWithAppointment(appt: Appointment): CalendarEvent {
  return { id: "1", appointment: appt } as unknown as CalendarEvent;
}

function mockFetch(
  classes: TasksRangeResponse["classes"],
  tasks: ModuleTask[],
  holidays: TasksRangeResponse["holidays"] = [],
) {
  const response: TasksRangeResponse = {
    from: "2026-08-01",
    to: "2026-08-31",
    classes,
    tasks,
    appointments: [],
    holidays,
  };
  vi.spyOn(api, "fetchModuleTasks").mockResolvedValue(response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Calendar", () => {
  it("fetches the month range and renders the grade legend (CalendarPanel) once data arrives", async () => {
    mockFetch(
      [{ id: "grade-7-realschule-2026", label: "grade-7-realschule-2026" }],
      [
        task({
          classId: "grade-7-realschule-2026",
          moduleId: "m1",
          moduleTitle: "Back in school",
        }),
      ],
    );
    render(
      <Calendar
        baseUrl="http://127.0.0.1:1"
        month="2026-08-01"
        onOpenChat={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("grade-7-realschule-2026")).toBeInTheDocument(),
    );
    expect(api.fetchModuleTasks).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:1",
      from: "2026-06-01",
      to: "2027-05-31",
    });
  });

  it("renders without crashing in dark mode", async () => {
    mockFetch(
      [{ id: "grade-7-realschule-2026", label: "grade-7-realschule-2026" }],
      [task({ classId: "grade-7-realschule-2026", moduleId: "m1" })],
    );
    const { container } = render(
      <Calendar
        baseUrl="http://127.0.0.1:1"
        month="2026-08-01"
        onOpenChat={() => {}}
        dark
      />,
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="companion-calendar"]'),
      ).toBeInTheDocument(),
    );
  });

  it("renders with no grade legend when there are no classes yet", async () => {
    mockFetch([], []);
    const { container } = render(
      <Calendar
        baseUrl="http://127.0.0.1:1"
        month="2026-08-01"
        onOpenChat={() => {}}
      />,
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="companion-calendar"]'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("grade-7-realschule-2026"),
    ).not.toBeInTheDocument();
  });

  it("shows a Holidays entry in the legend once holiday data arrives", async () => {
    mockFetch(
      [{ id: "grade-7-realschule-2026", label: "grade-7-realschule-2026" }],
      [task({ classId: "grade-7-realschule-2026", moduleId: "m1" })],
      [{ name: "Fixture Break", from: "2026-08-17", to: "2026-08-21" }],
    );
    render(
      <Calendar
        baseUrl="http://127.0.0.1:1"
        month="2026-08-01"
        onOpenChat={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText("Holidays")).toBeInTheDocument());
  });
});

// EventContent is tested directly (not through the mounted Calendar) since @svar-ui/react-calendar
// virtualizes its grid off real pixel measurements that jsdom only approximates (see the module
// doc comment above) -- event-cell content isn't reliably queryable through a full Calendar mount.
// EventContent is a plain function component, so rendering it standalone sidesteps that entirely.
describe("EventContent", () => {
  // Material/plan links used to render here, but a real event box (week/month view) is only
  // wide enough to show the title before .companion-event-content's ellipsis clips everything
  // after it -- moved to LessonDetailModal (LessonDetailModal.test.tsx), opened by double-click,
  // which has real room. EventContent now renders the title only, and never any link, regardless
  // of hasLessonSpec or materials.
  it("renders the appointment's module title as plain text, no links", () => {
    render(
      <EventContent
        event={eventWithAppointment(
          appointment({
            hasLessonSpec: true,
            materials: [
              { file: "materials/gap_fill-x.html", type: "gap_fill", title: "Gap Fill X" },
            ],
          }),
        )}
        mode="month"
      />,
    );
    expect(screen.getByText("Back in school")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders the same plain title when hasLessonSpec is false", () => {
    render(
      <EventContent
        event={eventWithAppointment(appointment({ hasLessonSpec: false }))}
        mode="month"
      />,
    );
    expect(screen.getByText("Back in school")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
