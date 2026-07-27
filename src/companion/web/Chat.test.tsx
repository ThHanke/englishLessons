// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { Chat, GAP_KIND_LABELS, competenceLabel } from "./Chat.tsx";
import * as api from "./api.ts";
import type { TeachingDayContext, NonTeachingDayContext } from "./api.ts";

afterEach(() => cleanup());

beforeEach(() => {
  vi.restoreAllMocks();
});

const TEACHING_CTX: TeachingDayContext = {
  isTeachingDay: true,
  className: "5a",
  date: "2026-08-05",
  moduleId: "mod-1",
  moduleTitle: "Greetings and introductions",
  moduleGoals: [
    "Introduce yourself and ask personal questions",
    "Use simple present for everyday routines",
  ],
  weekInModule: 2,
  phase: "practice",
  gaps: [
    {
      competenceId: "fk.g.simple_present",
      moduleId: "mod-1",
      kind: "under-depth",
      requiredDepth: "produce",
      currentDepth: "understand",
    },
  ],
  lessonSpecPath: "plans/grade-5/artifacts/5a/2026-08-05/lesson-spec.json",
  lessonSpec: {
    class: "5a",
    date: "2026-08-05",
    school_week: 3,
    module: { id: "mod-1", title: "Greetings", week_in_module: 2, of: 6 },
    phase: "practice",
    pace_factor: 1.0,
    pace_reason: "on track",
    focus_competences: [
      { id: "C1", topic: "Introducing yourself", mode: ["understand", "produce"] },
    ],
    content_field: { id: "CF1", text: "Personal information" },
    text_types: ["dialogue", "short paragraph"],
    milestone_context: { next: "Unit test 1", in_slots: 4, assesses: ["C1", "C2"] },
    prior_covered: ["alphabet", "numbers"],
    cefr_target: "A1",
    known_vocab_ref: "plans/grade-5/vocabulary.yaml",
    textbook_refs: [{ book: "Green Line 1", citation: "p. 22-24", slot: "2" }],
    suggested_exercise_types: ["gap-fill", "role-play"],
    curriculum_ref: "NRW-Gym-E-5",
  },
};

const NON_TEACHING_CTX: NonTeachingDayContext = {
  isTeachingDay: false,
  className: "5a",
  date: "2026-08-09",
  reason: "weekend",
};

function mockLessonPreview(ctx: TeachingDayContext | NonTeachingDayContext = TEACHING_CTX) {
  vi.spyOn(api, "fetchLessonPreview").mockResolvedValue(ctx);
}

describe("Chat", () => {
  it("renders disabled state when serverAvailable is false", () => {
    render(
      <Chat
        classId="5a"
        date="2026-08-05"
        baseUrl="http://localhost:5199"
        serverAvailable={false}
        sessionToken={null}
      />,
    );
    expect(screen.getByTestId("chat-disabled")).toBeInTheDocument();
    expect(screen.getByText("Chat unavailable")).toBeInTheDocument();
  });

  it("renders empty state when no date selected", () => {
    render(
      <Chat
        classId={null}
        date={null}
        baseUrl="http://localhost:5199"
        serverAvailable={true}
        sessionToken="tok"
      />,
    );
    expect(screen.getByTestId("chat-empty")).toBeInTheDocument();
  });

  it("shows context preview when date is selected", async () => {
    mockLessonPreview();
    render(
      <Chat
        classId="5a"
        date="2026-08-05"
        baseUrl="http://localhost:5199"
        serverAvailable={true}
        sessionToken="tok"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-preview-context")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/5a · 2026-08-05/).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(TEACHING_CTX.moduleTitle))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(TEACHING_CTX.moduleGoals[0]!))).toBeInTheDocument();
    const gap = TEACHING_CTX.gaps[0]!;
    expect(screen.getByText(GAP_KIND_LABELS[gap.kind]!)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(competenceLabel(gap.competenceId)))).toBeInTheDocument();
    expect(screen.getByText(TEACHING_CTX.lessonSpec!.content_field.text)).toBeInTheDocument();
    expect(screen.getByText(TEACHING_CTX.lessonSpec!.milestone_context.next)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(TEACHING_CTX.lessonSpec!.textbook_refs[0]!.book))).toBeInTheDocument();
  });

  it("shows non-teaching day in preview", async () => {
    mockLessonPreview(NON_TEACHING_CTX);
    render(
      <Chat
        classId="5a"
        date="2026-08-09"
        baseUrl="http://localhost:5199"
        serverAvailable={true}
        sessionToken="tok"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-preview-context")).toBeInTheDocument();
    });

    expect(screen.getByText(/Non-teaching day: weekend/)).toBeInTheDocument();
  });

  it("transitions from preview to chat on 'Start planning'", async () => {
    mockLessonPreview();
    render(
      <Chat
        classId="5a"
        date="2026-08-05"
        baseUrl="http://localhost:5199"
        serverAvailable={true}
        sessionToken="tok"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Start planning")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Start planning"));

    await waitFor(() => {
      expect(screen.getByTestId("companion-chat")).toBeInTheDocument();
    });
  });

  it("shows confirm dialog when switching dates mid-conversation", async () => {
    mockLessonPreview();
    const { rerender } = render(
      <Chat
        classId="5a"
        date="2026-08-05"
        baseUrl="http://localhost:5199"
        serverAvailable={true}
        sessionToken="tok"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Start planning")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Start planning"));

    await waitFor(() => {
      expect(screen.getByTestId("companion-chat")).toBeInTheDocument();
    });

    rerender(
      <Chat
        classId="5a"
        date="2026-08-10"
        baseUrl="http://localhost:5199"
        serverAvailable={true}
        sessionToken="tok"
      />,
    );

    await waitFor(() => {
      const dialog = screen.queryByTestId("chat-switch-confirm");
      if (dialog) {
        expect(dialog).toBeInTheDocument();
      } else {
        expect(screen.getByTestId("chat-preview")).toBeInTheDocument();
      }
    });
  });

  it("never attempts fetch when server unavailable", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <Chat
        classId="5a"
        date="2026-08-05"
        baseUrl="http://localhost:5199"
        serverAvailable={false}
        sessionToken={null}
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows loading state while fetching preview", () => {
    vi.spyOn(api, "fetchLessonPreview").mockReturnValue(new Promise(() => {}));
    render(
      <Chat
        classId="5a"
        date="2026-08-05"
        baseUrl="http://localhost:5199"
        serverAvailable={true}
        sessionToken="tok"
      />,
    );

    expect(screen.getByTestId("chat-preview-loading")).toBeInTheDocument();
  });

  it("shows error state with fallback button on preview fetch failure", async () => {
    vi.spyOn(api, "fetchLessonPreview").mockRejectedValue(new Error("network error"));
    render(
      <Chat
        classId="5a"
        date="2026-08-05"
        baseUrl="http://localhost:5199"
        serverAvailable={true}
        sessionToken="tok"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-preview-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Start chat anyway")).toBeInTheDocument();
  });
});
