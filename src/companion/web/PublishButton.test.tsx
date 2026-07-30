// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { PublishButton } from "./PublishButton.tsx";
import * as api from "./api.ts";

afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PublishButton", () => {
  it("renders nothing without a session token", () => {
    const { container } = render(
      <PublishButton baseUrl="http://127.0.0.1:1" sessionToken={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the changed-file count and disables the button at zero", async () => {
    vi.spyOn(api, "fetchGitStatus").mockResolvedValue({
      branch: "main",
      changedFiles: [],
      ahead: 0,
      behind: 0,
      hasUpstream: true,
    });
    render(<PublishButton baseUrl="http://127.0.0.1:1" sessionToken="tok" />);
    await waitFor(() =>
      expect(api.fetchGitStatus).toHaveBeenCalledWith({ baseUrl: "http://127.0.0.1:1" }),
    );
    const button = screen.getByTestId("publish-button");
    expect(button).toHaveTextContent("Publish changes");
    expect(button).toBeDisabled();
  });

  it("opens a confirmation dialog listing changed files, and publishes on confirm", async () => {
    vi.spyOn(api, "fetchGitStatus").mockResolvedValue({
      branch: "main",
      changedFiles: ["artifacts/foo/lesson-plan.json", "calendar/2026-2027.yaml"],
      ahead: 0,
      behind: 0,
      hasUpstream: true,
    });
    const publish = vi
      .spyOn(api, "publishGitChanges")
      .mockResolvedValue({ status: "published", commitSha: "a".repeat(40) });

    render(<PublishButton baseUrl="http://127.0.0.1:1" sessionToken="tok" />);
    await waitFor(() => expect(screen.getByTestId("publish-button")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("publish-button"));
    expect(screen.getByTestId("publish-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Have you reviewed these changes/)).toBeInTheDocument();
    expect(screen.getByText("artifacts/foo/lesson-plan.json")).toBeInTheDocument();
    expect(screen.getByText("calendar/2026-2027.yaml")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));
    await waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "http://127.0.0.1:1", sessionToken: "tok" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("publish-result")).toHaveTextContent(/Published \(commit aaaaaaa\)/),
    );
  });

  it("shows the push-failed error verbatim without discarding the local commit", async () => {
    vi.spyOn(api, "fetchGitStatus").mockResolvedValue({
      branch: "main",
      changedFiles: ["artifacts/foo/lesson-plan.json"],
      ahead: 0,
      behind: 0,
      hasUpstream: true,
    });
    vi.spyOn(api, "publishGitChanges").mockResolvedValue({
      status: "push-failed",
      commitSha: "b".repeat(40),
      error: "Permission denied (publickey)",
    });

    render(<PublishButton baseUrl="http://127.0.0.1:1" sessionToken="tok" />);
    await waitFor(() => expect(screen.getByTestId("publish-button")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("publish-button"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Publish" }));

    await waitFor(() =>
      expect(screen.getByTestId("publish-result")).toHaveTextContent(
        "Committed locally, but push failed: Permission denied (publickey)",
      ),
    );
    // Still offers Cancel (not "Close") and the confirm button again -- push failing isn't a
    // terminal success state the dialog should auto-close on.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("cancel closes the dialog without publishing", async () => {
    vi.spyOn(api, "fetchGitStatus").mockResolvedValue({
      branch: "main",
      changedFiles: ["artifacts/foo/lesson-plan.json"],
      ahead: 0,
      behind: 0,
      hasUpstream: true,
    });
    const publish = vi.spyOn(api, "publishGitChanges");

    render(<PublishButton baseUrl="http://127.0.0.1:1" sessionToken="tok" />);
    await waitFor(() => expect(screen.getByTestId("publish-button")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("publish-button"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByTestId("publish-dialog")).not.toBeInTheDocument();
    expect(publish).not.toHaveBeenCalled();
  });
});
