import { useEffect, useState } from "react";
import { fetchGitStatus, publishGitChanges } from "./api.ts";
import type { GitStatusSummary, PublishResult } from "./api.ts";

export interface PublishButtonProps {
  baseUrl: string;
  /** Only rendered when set -- same read-only-until-authenticated gate every other write action
   * in the app already uses (Calendar.tsx's `canEdit`). */
  sessionToken: string | null;
}

type DialogResult = PublishResult | { status: "error"; error: string };

/** Publishing is entirely human-click-initiated: the planning-chat agent has no tool that reaches
 * this, and there is no path from a chat message to `publishGitChanges` -- the confirmation
 * dialog below is the only way this fires, structurally, not by trusting an LLM to ask first. */
export function PublishButton({ baseUrl, sessionToken }: PublishButtonProps) {
  const [status, setStatus] = useState<GitStatusSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<DialogResult | null>(null);

  useEffect(() => {
    if (!sessionToken) return;
    fetchGitStatus({ baseUrl })
      .then(setStatus)
      .catch(() => {});
  }, [baseUrl, sessionToken]);

  if (!sessionToken) return null;

  const changedCount = status?.changedFiles.length ?? 0;

  function openDialog() {
    setMessage(`Update lesson plans (${changedCount} file${changedCount === 1 ? "" : "s"})`);
    setResult(null);
    setOpen(true);
  }

  async function handlePublish() {
    if (!sessionToken) return;
    setPublishing(true);
    try {
      const res = await publishGitChanges({ baseUrl, sessionToken, message });
      setResult(res);
      if (res.status === "published" || res.status === "nothing-to-commit") {
        fetchGitStatus({ baseUrl })
          .then(setStatus)
          .catch(() => {});
      }
    } catch (err) {
      setResult({ status: "error", error: (err as Error).message });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="companion-button companion-button-primary"
        data-testid="publish-button"
        disabled={changedCount === 0}
        onClick={openDialog}
      >
        Publish changes{changedCount > 0 ? ` (${changedCount})` : ""}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Publish changes"
          data-testid="publish-dialog"
          className="companion-modal-overlay"
        >
          <div className="companion-modal-dialog">
            <h2 className="companion-modal-title">Publish changes</h2>
            <p className="companion-modal-subtitle">
              Have you reviewed these changes? Publishing pushes them to origin — they become
              public.
            </p>
            {status && status.changedFiles.length > 0 && (
              <ul className="companion-publish-file-list">
                {status.changedFiles.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            <textarea
              className="companion-publish-message"
              data-testid="publish-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
            />

            {result && (
              <p data-testid="publish-result" className="companion-modal-subtitle">
                {result.status === "published" &&
                  `Published (commit ${result.commitSha.slice(0, 7)}).`}
                {result.status === "nothing-to-commit" && "Nothing to publish."}
                {result.status === "commit-failed" && `Commit failed: ${result.error}`}
                {result.status === "push-failed" &&
                  `Committed locally, but push failed: ${result.error}`}
                {result.status === "error" && result.error}
              </p>
            )}

            <div className="companion-modal-actions">
              <button type="button" className="companion-button" onClick={() => setOpen(false)}>
                {result?.status === "published" ? "Close" : "Cancel"}
              </button>
              {result?.status !== "published" && (
                <button
                  type="button"
                  className="companion-button companion-button-primary"
                  disabled={publishing || message.trim().length === 0}
                  onClick={handlePublish}
                >
                  {publishing ? "Publishing…" : "Confirm & Publish"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
