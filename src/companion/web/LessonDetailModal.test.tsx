// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LessonDetailModal } from "./LessonDetailModal.tsx";
import type { Appointment } from "./api.ts";

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

describe("LessonDetailModal", () => {
  it("always renders the lesson plan link", () => {
    render(
      <LessonDetailModal
        appointment={appointment()}
        canEdit={false}
        onEditSeries={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: "View lesson plan" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View homework" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View test" })).not.toBeInTheDocument();
  });

  it("shows the homework link only when a homework material exists", () => {
    render(
      <LessonDetailModal
        appointment={appointment({
          materials: [{ file: "materials/homework-x.html", type: "homework", title: "Homework" }],
        })}
        canEdit={false}
        onEditSeries={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: "View homework" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View test" })).not.toBeInTheDocument();
  });

  it("shows the test link only when a test material exists", () => {
    render(
      <LessonDetailModal
        appointment={appointment({
          materials: [{ file: "materials/test-x.html", type: "test", title: "Test" }],
        })}
        canEdit={false}
        onEditSeries={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: "View test" })).toBeInTheDocument();
  });

  it("shows the edit-series button only when canEdit, and wires it to onEditSeries", () => {
    const onEditSeries = vi.fn();
    const { rerender } = render(
      <LessonDetailModal
        appointment={appointment()}
        canEdit={false}
        onEditSeries={onEditSeries}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit lesson series" })).not.toBeInTheDocument();

    rerender(
      <LessonDetailModal
        appointment={appointment()}
        canEdit={true}
        onEditSeries={onEditSeries}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit lesson series" }));
    expect(onEditSeries).toHaveBeenCalledOnce();
  });

  it("uses page-relative static hrefs when linkMode is static", () => {
    render(
      <LessonDetailModal
        appointment={appointment()}
        canEdit={false}
        linkMode="static"
        onEditSeries={() => {}}
        onClose={() => {}}
      />,
    );
    const link = screen.getByRole("link", { name: "View lesson plan" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("classes/grade-7-2026/2026-08-17/lesson-plan/");
  });

  it("wires the close button to onClose", () => {
    const onClose = vi.fn();
    render(
      <LessonDetailModal
        appointment={appointment()}
        canEdit={false}
        onEditSeries={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
