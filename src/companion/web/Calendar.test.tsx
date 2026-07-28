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
) {
  const response: TasksRangeResponse = {
    from: "2026-08-01",
    to: "2026-08-31",
    classes,
    tasks,
    appointments: [],
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
});

// EventContent is tested directly (not through the mounted Calendar) since @svar-ui/react-calendar
// virtualizes its grid off real pixel measurements that jsdom only approximates (see the module
// doc comment above) -- event-cell content isn't reliably queryable through a full Calendar mount.
// EventContent is a plain function component, so rendering it standalone sidesteps that entirely.
describe("EventContent", () => {
  it("renders a link to the lesson-spec preview when hasLessonSpec is true", () => {
    render(
      <EventContent
        event={eventWithAppointment(appointment({ hasLessonSpec: true }))}
        mode="month"
      />,
    );
    const link = screen.getByRole("link", { name: "plan" });
    expect(link).toHaveAttribute(
      "href",
      "/api/artifacts/grade-7-realschule-2026/2026-08-05/lesson-spec.json",
    );
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not render a lesson-spec link when hasLessonSpec is false", () => {
    render(
      <EventContent
        event={eventWithAppointment(appointment({ hasLessonSpec: false }))}
        mode="month"
      />,
    );
    expect(screen.queryByRole("link", { name: "plan" })).not.toBeInTheDocument();
  });

  it("renders one link per material, with rel=noopener noreferrer", () => {
    render(
      <EventContent
        event={eventWithAppointment(
          appointment({
            materials: [
              { file: "materials/gap_fill-x.html", type: "gap_fill", title: "Gap Fill X" },
              { file: "materials/mcq-y.html", type: "mcq", title: "MCQ Y" },
            ],
          }),
        )}
        mode="month"
      />,
    );
    const gapFillLink = screen.getByRole("link", { name: "Gap Fill X" });
    expect(gapFillLink).toHaveAttribute(
      "href",
      "/api/artifacts/grade-7-realschule-2026/2026-08-05/materials/gap_fill-x.html",
    );
    expect(gapFillLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "MCQ Y" })).toBeInTheDocument();
  });

  it("still shows the lesson-spec link when hasLessonSpec is true but there are zero materials", () => {
    render(
      <EventContent
        event={eventWithAppointment(
          appointment({ hasLessonSpec: true, materials: [] }),
        )}
        mode="month"
      />,
    );
    expect(screen.getByRole("link", { name: "plan" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
