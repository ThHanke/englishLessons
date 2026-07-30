import { useCallback, useEffect, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { useCompanionRuntime, type ChatSession } from "./runtime.ts";
import { fetchLessonPreview } from "./api.ts";
import { PublishButton } from "./PublishButton.tsx";
import { lessonPlanPageHref, homeworkPageHref, testPageHref } from "./calendarMapping.ts";
import type {
  DateContext,
  TeachingDayContext,
  NonTeachingDayContext,
} from "./api.ts";

export interface ChatProps {
  classId: string | null;
  date: string | null;
  slotId?: string;
  baseUrl: string;
  serverAvailable: boolean;
  sessionToken: string | null;
  /** Fires once per completed chat turn (isRunning's true -> false transition) -- a cheap proxy
   * for "the agent may have saved something" without needing to know which tool ran, so a
   * sibling component (the calendar) can refetch and pick up new lesson-specs/materials. */
  onTurnComplete?: () => void;
}

export interface PreviewTarget {
  classId: string;
  date: string;
  slotId?: string;
}

interface PreviewState {
  target: PreviewTarget;
  context: DateContext | null;
  loading: boolean;
  error: string | null;
}

function buildSeedContent(target: PreviewTarget, ctx: DateContext): string {
  const parts: string[] = [
    `Date: ${target.date}${target.slotId ? ` (slot: ${target.slotId})` : ""}, Class: ${target.classId}`,
  ];
  if (ctx.isTeachingDay) {
    const t = ctx as TeachingDayContext;
    parts.push(`Module: ${t.moduleTitle ?? t.moduleId}, Week ${t.weekInModule}, Phase: ${PHASE_LABELS[t.phase] ?? t.phase}`);
    if (t.calendarDrift?.behindBySlots > 0) {
      parts.push(
        `Behind schedule: ${t.calendarDrift.behindBySlots} lesson${t.calendarDrift.behindBySlots > 1 ? "s" : ""} behind the planned calendar position as of this date -- consider compensating (skip a practice slot, fold in remedial coverage) rather than planning to the nominal position.`,
      );
    }
    if (t.moduleGoals?.length > 0) {
      parts.push(`Module goals:\n${t.moduleGoals.map((g) => `- ${g}`).join("\n")}`);
    }
    if (t.gaps.length > 0) {
      parts.push(
        `Coverage gaps for this lesson:\n${t.gaps.map((g) => `- ${GAP_KIND_LABELS[g.kind] ?? g.kind}: ${competenceLabel(g.competenceId)} [${g.competenceId}] (current: ${g.currentDepth ?? "not started"}, needs: ${g.requiredDepth})`).join("\n")}`,
      );
    }
    if (t.lessonSpec) {
      parts.push(`Existing lesson-spec at: ${t.lessonSpecPath}`);
      const spec = t.lessonSpec;
      parts.push(`Focus competences: ${spec.focus_competences.map((fc) => `${competenceLabel(fc.id)} [${fc.id}] — ${fc.topic} (${fc.mode.join(", ")})`).join("; ")}`);
      parts.push(`Content: ${spec.content_field.text}`);
      parts.push(`Text types: ${spec.text_types.join(", ")}`);
      parts.push(`CEFR target: ${spec.cefr_target}`);
      if (spec.textbook_refs.length > 0) {
        parts.push(`Textbook: ${spec.textbook_refs.map((r) => `${r.book} ${r.citation}`).join("; ")}`);
      }
      parts.push(`Upcoming milestone: ${spec.milestone_context.next} in ${spec.milestone_context.in_slots} lessons, assesses: ${spec.milestone_context.assesses.map((id) => `${competenceLabel(id)} [${id}]`).join(", ")}`);
      if (t.materials.length > 0) {
        parts.push(`Existing materials for this date: ${t.materials.map((m) => `${m.title} (${m.type})`).join(", ")}`);
      }
    } else {
      parts.push("No lesson plan exists yet for this date.");
    }
  } else {
    const nt = ctx as NonTeachingDayContext;
    parts.push(`Non-teaching day: ${nt.reason}`);
  }
  return parts.join("\n");
}

function buildInitialPrompt(ctx: DateContext | null): string {
  if (!ctx || !ctx.isTeachingDay) {
    return "What can I help you with for this date?";
  }
  const t = ctx as TeachingDayContext;
  if (t.lessonSpec) {
    return "A lesson plan already exists for this date. What would you like to work on?";
  }
  return "I'd like to plan this lesson. What are our options?";
}

export function Chat({
  classId,
  date,
  slotId,
  baseUrl,
  serverAvailable,
  sessionToken,
  onTurnComplete,
}: ChatProps) {
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<PreviewTarget | null>(null);
  const hasMessagesRef = useRef(false);

  const runtimeOptions = { baseUrl, sessionToken: sessionToken ?? "" };
  const { runtime, messages, setMessages, sendMessage, error, isRunning } = useCompanionRuntime(
    activeSession,
    runtimeOptions,
  );
  const pendingInitialPromptRef = useRef<string | null>(null);
  hasMessagesRef.current = messages.length > 0;

  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      onTurnComplete?.();
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, onTurnComplete]);

  const loadPreview = useCallback(
    async (target: PreviewTarget) => {
      setPreview({ target, context: null, loading: true, error: null });
      try {
        const ctx = await fetchLessonPreview({
          baseUrl,
          className: target.classId,
          date: target.date,
          slotId: target.slotId,
        });
        setPreview({ target, context: ctx, loading: false, error: null });
      } catch (err) {
        setPreview({
          target,
          context: null,
          loading: false,
          error: (err as Error).message,
        });
      }
    },
    [baseUrl],
  );

  useEffect(() => {
    if (!classId || !date || !serverAvailable || !sessionToken) return;
    const target: PreviewTarget = { classId, date, slotId };

    if (
      activeSession &&
      (activeSession.classId !== classId ||
        activeSession.date !== date ||
        activeSession.slotId !== slotId) &&
      hasMessagesRef.current
    ) {
      setPendingSwitch(target);
      return;
    }

    if (
      activeSession &&
      activeSession.classId === classId &&
      activeSession.date === date &&
      activeSession.slotId === slotId
    ) {
      return;
    }

    setActiveSession(null);
    loadPreview(target);
  }, [classId, date, slotId, serverAvailable, sessionToken, activeSession, loadPreview]);

  useEffect(() => {
    if (!activeSession || !pendingInitialPromptRef.current) return;
    const prompt = pendingInitialPromptRef.current;
    pendingInitialPromptRef.current = null;
    sendMessage(prompt);
  }, [activeSession, sendMessage]);

  function handleConfirmChat() {
    if (!preview?.target) return;
    const session: ChatSession = preview.target;
    const ctx = preview.context;
    setMessages([]);
    if (ctx) {
      setMessages([
        {
          role: "system",
          content: buildSeedContent(preview.target, ctx),
          id: "seed-context",
        },
      ]);
    }
    pendingInitialPromptRef.current = buildInitialPrompt(ctx);
    setActiveSession(session);
    setPreview(null);
  }

  function handleConfirmSwitch() {
    if (!pendingSwitch) return;
    const target = pendingSwitch;
    setPendingSwitch(null);
    setActiveSession(null);
    loadPreview(target);
  }

  function handleCancelSwitch() {
    setPendingSwitch(null);
  }

  if (!serverAvailable) {
    return (
      <div className="companion-chat-disabled" data-testid="chat-disabled">
        <p>
          <strong>Chat unavailable</strong>
        </p>
        <p>
          The companion server is not running. Start it with{" "}
          <code>npm run dev</code> to enable AI-assisted lesson planning.
        </p>
      </div>
    );
  }

  if (!classId || !date) {
    return (
      <div className="companion-chat-empty" data-testid="chat-empty">
        <p>Select a date from the calendar to start planning a lesson.</p>
      </div>
    );
  }

  if (preview) {
    return (
      <>
        <div className="companion-chat-preview" data-testid="chat-preview">
          <div className="companion-chat-header">
            <span>
              {preview.target.classId} · {preview.target.date}
            </span>
          </div>

          {preview.loading && (
            <div className="companion-chat-preview-body" data-testid="chat-preview-loading">
              <p>Loading lesson context...</p>
            </div>
          )}

          {preview.error && (
            <div className="companion-chat-preview-body" data-testid="chat-preview-error">
              <p>Could not load context: {preview.error}</p>
              <button type="button" onClick={handleConfirmChat}>
                Start chat anyway
              </button>
            </div>
          )}

          {preview.context && (
            <div className="companion-chat-preview-body" data-testid="chat-preview-context">
              <ContextPreview
                target={preview.target}
                context={preview.context}
              />
              <div className="companion-chat-preview-actions">
                <button
                  type="button"
                  className="companion-chat-send"
                  onClick={handleConfirmChat}
                >
                  Start planning
                </button>
              </div>
            </div>
          )}
        </div>

        {pendingSwitch && (
          <SwitchConfirmDialog
            activeSession={activeSession}
            pendingSwitch={pendingSwitch}
            onConfirm={handleConfirmSwitch}
            onCancel={handleCancelSwitch}
          />
        )}
      </>
    );
  }

  return (
    <>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="companion-chat" data-testid="companion-chat">
          <div className="companion-chat-header">
            <span>
              {activeSession?.classId} · {activeSession?.date}
            </span>
            <PublishButton baseUrl={baseUrl} sessionToken={sessionToken} />
          </div>

          {error && (
            <div className="companion-chat-error" data-testid="chat-error">
              {error}
            </div>
          )}

          <ThreadPrimitive.Root className="companion-chat-thread">
            <ThreadPrimitive.Viewport className="companion-chat-viewport">
              <ThreadPrimitive.Messages
                components={{
                  UserMessage: ChatUserMessage,
                  AssistantMessage: ChatAssistantMessage,
                }}
              />
            </ThreadPrimitive.Viewport>

            {isRunning && (
              <div className="companion-chat-typing" data-testid="chat-typing">
                Thinking…
              </div>
            )}

            <ComposerPrimitive.Root className="companion-chat-composer">
              <ComposerPrimitive.Input
                placeholder="Ask about this lesson..."
                className="companion-chat-input"
              />
              <ComposerPrimitive.Send className="companion-chat-send">
                Send
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.Root>
        </div>
      </AssistantRuntimeProvider>

      {pendingSwitch && (
        <SwitchConfirmDialog
          activeSession={activeSession}
          pendingSwitch={pendingSwitch}
          onConfirm={handleConfirmSwitch}
          onCancel={handleCancelSwitch}
        />
      )}
    </>
  );
}

export const COMPETENCE_AREA_LABELS: Record<string, string> = {
  "fk.g": "Grammar",
  "fk.k.hoer": "Listening",
  "fk.k.lesen": "Reading",
  "fk.k.sprechen": "Speaking",
  "fk.k.schreiben": "Writing",
  "fk.k.sprachmittlung": "Mediation",
  "fk.k": "Communication",
  "fk.w": "Vocabulary & Phrases",
  "fk.a": "Pronunciation",
  "fk.o": "Orthography",
};

export function competenceLabel(id: string): string {
  for (const [prefix, label] of Object.entries(COMPETENCE_AREA_LABELS)) {
    if (id.startsWith(prefix + ".") || id === prefix) {
      const suffix = id.slice(prefix.length + 1);
      const readable = suffix
        ? suffix.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "";
      return readable ? `${label}: ${readable}` : label;
    }
  }
  return id.replace(/_/g, " ");
}

export const GAP_KIND_LABELS: Record<string, string> = {
  "at-risk": "At risk",
  "under-depth": "Needs more depth",
  uncovered: "Not yet covered",
};

export const PHASE_LABELS: Record<string, string> = {
  new_input: "Introducing new material",
  practice: "Practice & consolidation",
  revision: "Revision",
  assessment: "Assessment",
};

function GapBadge({ kind }: { kind: string }) {
  const cls =
    kind === "at-risk"
      ? "companion-badge-danger"
      : kind === "under-depth"
        ? "companion-badge-warn"
        : "companion-badge-info";
  return (
    <span className={`companion-badge ${cls}`}>
      {GAP_KIND_LABELS[kind] ?? kind}
    </span>
  );
}

export function ContextPreview({
  target,
  context,
}: {
  target: PreviewTarget;
  context: DateContext;
}) {
  if (!context.isTeachingDay) {
    const nt = context as NonTeachingDayContext;
    return (
      <div className="companion-preview-detail">
        <h3>{target.classId} · {target.date}</h3>
        <p className="companion-preview-note">Non-teaching day: {nt.reason}</p>
      </div>
    );
  }

  const t = context as TeachingDayContext;
  const spec = t.lessonSpec;

  return (
    <div className="companion-preview-detail">
      {/* Once planned, this lesson's actual topic (content_field.text) is more useful as the
          heading than the module title, which is the same for every lesson in the module --
          same preference as the calendar's appointment cards (calendarMapping.ts). */}
      <h3>{spec?.content_field.text ?? t.moduleTitle ?? t.moduleId}</h3>
      <p className="companion-preview-subtitle">
        {target.classId} · {target.date} · Week {t.weekInModule}
        {spec ? ` of ${spec.module.of}` : ""} · {PHASE_LABELS[t.phase] ?? t.phase}
        {spec && <> · {t.moduleTitle}</>}
      </p>

      {t.calendarDrift?.behindBySlots > 0 && (
        <p className="companion-preview-note companion-badge-warn">
          Behind schedule: {t.calendarDrift.behindBySlots} lesson
          {t.calendarDrift.behindBySlots > 1 ? "s" : ""} behind the planned position.
        </p>
      )}

      {t.moduleGoals?.length > 0 && (
        <section className="companion-preview-section">
          <h4>Module Goals</h4>
          <ul className="companion-preview-goal-list">
            {t.moduleGoals.map((goal, i) => (
              <li key={i}>{goal}</li>
            ))}
          </ul>
        </section>
      )}

      {spec && (
        <section className="companion-preview-section">
          <h4>Lesson Details</h4>
          <dl className="companion-preview-fields">
            {spec.pace_factor !== 1.0 && (
              <>
                <dt>Pace</dt>
                <dd>×{spec.pace_factor} — {spec.pace_reason}</dd>
              </>
            )}
            <dt>CEFR target</dt>
            <dd>{spec.cefr_target}</dd>
            <dt>Content</dt>
            <dd>{spec.content_field.text}</dd>
            <dt>Text types</dt>
            <dd>{spec.text_types.join(", ")}</dd>
          </dl>
        </section>
      )}

      {spec && (
        <section className="companion-preview-section">
          <h4>Materials</h4>
          <p className="companion-preview-links">
            <a
              href={lessonPlanPageHref(target.classId, target.date, target.slotId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View lesson plan
            </a>
            {t.materials.some((m) => m.type === "homework") && (
              <>
                {" · "}
                <a
                  href={homeworkPageHref(target.classId, target.date, target.slotId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View homework
                </a>
              </>
            )}
            {t.materials.some((m) => m.type === "test") && (
              <>
                {" · "}
                <a
                  href={testPageHref(target.classId, target.date, target.slotId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View test
                </a>
              </>
            )}
          </p>
        </section>
      )}

      {spec && spec.focus_competences.length > 0 && (
        <section className="companion-preview-section">
          <h4>Focus Competences</h4>
          <ul className="companion-preview-competence-list">
            {spec.focus_competences.map((fc) => (
              <li key={fc.id}>
                <strong>{competenceLabel(fc.id)}</strong>
                <span className="companion-preview-topic"> — {fc.topic}</span>
                <span className="companion-preview-modes">
                  ({fc.mode.join(", ")})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {t.gaps.length > 0 && (
        <section className="companion-preview-section">
          <h4>Coverage Gaps</h4>
          <p className="companion-preview-gap-intro">
            {t.gaps.length} competence{t.gaps.length > 1 ? "s" : ""} need
            attention in this module:
          </p>
          <ul className="companion-preview-gap-list">
            {t.gaps.map((g) => (
              <li key={`${g.moduleId}-${g.competenceId}`}>
                <GapBadge kind={g.kind} />
                <span className="companion-gap-label">
                  {competenceLabel(g.competenceId)}
                </span>
                <span className="companion-gap-depth">
                  ({g.currentDepth ?? "not started"} → needs {g.requiredDepth})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {t.gaps.length === 0 && (
        <section className="companion-preview-section">
          <p className="companion-preview-ok">
            All competences are on track for this module.
          </p>
        </section>
      )}

      {spec && (
        <section className="companion-preview-section">
          <h4>Upcoming Milestone</h4>
          <dl className="companion-preview-fields">
            <dt>Next</dt>
            <dd>{spec.milestone_context.next}</dd>
            <dt>In</dt>
            <dd>{spec.milestone_context.in_slots} lesson{spec.milestone_context.in_slots !== 1 ? "s" : ""}</dd>
            <dt>Assesses</dt>
            <dd>
              {spec.milestone_context.assesses
                .map((id) => competenceLabel(id))
                .join(", ")}
            </dd>
          </dl>
        </section>
      )}

      {spec && spec.suggested_exercise_types.length > 0 && (
        <section className="companion-preview-section">
          <h4>Suggested Activities</h4>
          <p>{spec.suggested_exercise_types.join(", ")}</p>
        </section>
      )}

      {spec && spec.textbook_refs.length > 0 && (
        <section className="companion-preview-section">
          <h4>Textbook References</h4>
          <ul className="companion-preview-ref-list">
            {spec.textbook_refs.map((ref, i) => (
              <li key={i}>
                <strong>{ref.book}</strong> — {ref.citation}
                {ref.slot && <> (slot {ref.slot})</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!spec && (
        <section className="companion-preview-section">
          <p className="companion-preview-note">
            No lesson plan exists yet for this date. The AI assistant will help
            you create one based on the module goals and coverage gaps above.
          </p>
        </section>
      )}
    </div>
  );
}

function SwitchConfirmDialog({
  activeSession,
  pendingSwitch,
  onConfirm,
  onCancel,
}: {
  activeSession: ChatSession | null;
  pendingSwitch: PreviewTarget;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Switch date confirmation"
      data-testid="chat-switch-confirm"
      className="companion-modal-overlay"
    >
      <div className="companion-modal-dialog">
        <p>
          <strong>Switch to a different lesson?</strong>
        </p>
        <p>
          You have an active conversation for {activeSession?.classId} ·{" "}
          {activeSession?.date}. Switching to {pendingSwitch.classId} ·{" "}
          {pendingSwitch.date} will start a new conversation. Your current
          conversation will be resumable later.
        </p>
        <div className="companion-modal-actions">
          <button type="button" className="companion-button" onClick={onCancel}>
            Stay here
          </button>
          <button type="button" className="companion-button companion-button-primary" onClick={onConfirm}>
            Switch
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatUserMessage() {
  return (
    <MessagePrimitive.Root className="companion-chat-message companion-chat-user">
      <MessagePrimitive.Content />
    </MessagePrimitive.Root>
  );
}

function ChatAssistantMessage() {
  return (
    <MessagePrimitive.Root className="companion-chat-message companion-chat-assistant">
      <MessagePrimitive.Content />
    </MessagePrimitive.Root>
  );
}
