// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EventPopup } from "./EventPopup.tsx";
import type { Appointment, ModuleTask } from "./api.ts";
import type { CalendarEvent } from "@svar-ui/react-calendar";

afterEach(cleanup);

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    classId: "grade-7-2026",
    classLabel: "Grade 7",
    moduleId: "m1",
    moduleTitle: "Passive Voice",
    date: "2026-08-17",
    hasLessonSpec: true,
    materials: [],
    ...overrides,
  };
}

function task(overrides: Partial<ModuleTask> = {}): ModuleTask {
  return {
    classId: "grade-7-2026",
    classLabel: "Grade 7",
    moduleId: "m1",
    moduleTitle: "Passive Voice",
    startDate: "2026-08-03",
    endDate: "2026-08-14",
    gaps: [],
    plannedDates: [],
    coveragePercent: 40,
    milestoneDate: null,
    milestoneType: "none",
    milestoneAssesses: [],
    ...overrides,
  };
}

const defaultProps = {
  close: () => {},
  canEdit: false,
  onOpenChat: () => {},
  onEditSeries: () => {},
  lessonSlots: {},
  deletingSlotId: null,
  deleteError: null,
  onDeleteSlot: () => {},
};

describe("EventPopup", () => {
  it("appointment: always renders the lesson plan link", () => {
    render(
      <EventPopup
        {...defaultProps}
        event={{ id: "1", appointment: appointment() } as unknown as CalendarEvent}
      />,
    );
    expect(screen.getByRole("link", { name: "View lesson plan" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View homework" })).not.toBeInTheDocument();
  });

  it("appointment: shows homework/test links only when those materials exist", () => {
    render(
      <EventPopup
        {...defaultProps}
        event={{
          id: "1",
          appointment: appointment({
            materials: [
              { file: "materials/homework-x.html", type: "homework", title: "Homework" },
              { file: "materials/test-x.html", type: "test", title: "Test" },
            ],
          }),
        } as unknown as CalendarEvent}
      />,
    );
    expect(screen.getByRole("link", { name: "View homework" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View test" })).toBeInTheDocument();
  });

  it("appointment: 'Edit lesson series' only shows when canEdit", () => {
    const onEditSeries = vi.fn();
    const { rerender } = render(
      <EventPopup
        {...defaultProps}
        canEdit={false}
        onEditSeries={onEditSeries}
        event={{ id: "1", appointment: appointment() } as unknown as CalendarEvent}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit lesson series" })).not.toBeInTheDocument();

    rerender(
      <EventPopup
        {...defaultProps}
        canEdit={true}
        onEditSeries={onEditSeries}
        event={{ id: "1", appointment: appointment() } as unknown as CalendarEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit lesson series" }));
    expect(onEditSeries).toHaveBeenCalledWith(expect.objectContaining({ classId: "grade-7-2026" }));
  });

  it("appointment: 'Open in planning chat' calls onOpenChat and close", () => {
    const onOpenChat = vi.fn();
    const close = vi.fn();
    render(
      <EventPopup
        {...defaultProps}
        close={close}
        onOpenChat={onOpenChat}
        event={{ id: "1", appointment: appointment({ slotId: "s1" }) } as unknown as CalendarEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open in planning chat" }));
    expect(onOpenChat).toHaveBeenCalledWith("grade-7-2026", "2026-08-17", "s1");
    expect(close).toHaveBeenCalledOnce();
  });

  it("appointment: uses page-relative static hrefs when linkMode is static", () => {
    render(
      <EventPopup
        {...defaultProps}
        linkMode="static"
        event={{ id: "1", appointment: appointment() } as unknown as CalendarEvent}
      />,
    );
    const link = screen.getByRole("link", { name: "View lesson plan" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("classes/grade-7-2026/2026-08-17/lesson-plan/");
  });

  it("appointment: wires the Close button to close", () => {
    const close = vi.fn();
    render(
      <EventPopup
        {...defaultProps}
        close={close}
        event={{ id: "1", appointment: appointment() } as unknown as CalendarEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("task: shows coverage, gaps, and planned dates", () => {
    render(
      <EventPopup
        {...defaultProps}
        event={{ id: "t1", task: task({ coveragePercent: 60, plannedDates: ["2026-08-05"] }) } as unknown as CalendarEvent}
      />,
    );
    expect(screen.getByText("Passive Voice")).toBeInTheDocument();
    expect(screen.getByText(/Coverage: 60%/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-05/)).toBeInTheDocument();
  });

  it("task: manage-schedule slot list only shows when canEdit", () => {
    const { rerender } = render(
      <EventPopup
        {...defaultProps}
        canEdit={false}
        lessonSlots={{ "grade-7-2026": [{ id: "slot-1", day: "Mon", start: "08:00", end: "08:45", half_year: 1 }] }}
        event={{ id: "t1", task: task() } as unknown as CalendarEvent}
      />,
    );
    expect(screen.queryByTestId("manage-schedule")).not.toBeInTheDocument();

    rerender(
      <EventPopup
        {...defaultProps}
        canEdit={true}
        lessonSlots={{ "grade-7-2026": [{ id: "slot-1", day: "Mon", start: "08:00", end: "08:45", half_year: 1 }] }}
        event={{ id: "t1", task: task() } as unknown as CalendarEvent}
      />,
    );
    expect(screen.getByTestId("manage-schedule")).toBeInTheDocument();
    expect(screen.getByTestId("slot-slot-1")).toBeInTheDocument();
  });

  it("holiday (no task/appointment payload): renders a minimal card with the event text", () => {
    render(
      <EventPopup
        {...defaultProps}
        event={{ id: "h1", text: "Fixture Break" } as unknown as CalendarEvent}
      />,
    );
    expect(screen.getByText("Fixture Break")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
