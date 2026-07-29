import { useCallback, useRef, useState } from "react";
import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";

export interface ChatSession {
  classId: string;
  date: string;
  slotId?: string;
}

export interface ChatRuntimeOptions {
  baseUrl: string;
  sessionToken: string;
}

interface NdjsonAssistantMessage {
  type: "assistant";
  message: {
    content: Array<{ type: string; text?: string }>;
  };
}

interface NdjsonStreamEvent {
  type: "stream_event";
  event: {
    type: string;
    delta?: { type: string; text?: string };
    content_block?: { type: string; text?: string };
  };
}

interface NdjsonTurnComplete {
  type: "companion_turn_complete";
  sessionId: string;
  startedFresh: boolean;
  notice?: string;
}

type NdjsonLine = NdjsonAssistantMessage | NdjsonStreamEvent | NdjsonTurnComplete | { type: string };

function extractAssistantText(msg: NdjsonAssistantMessage): string {
  return msg.message.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("");
}

export function useCompanionRuntime(
  session: ChatSession | null,
  options: ChatRuntimeOptions,
) {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef("");
  const noticeRef = useRef<string | null>(null);
  const seedSentRef = useRef(false);

  const prevSessionRef = useRef(session);
  if (
    session?.classId !== prevSessionRef.current?.classId ||
    session?.date !== prevSessionRef.current?.date ||
    session?.slotId !== prevSessionRef.current?.slotId
  ) {
    seedSentRef.current = false;
    prevSessionRef.current = session;
  }

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (!session) return;

      const userText =
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter(
                (p): p is { type: "text"; text: string } => p.type === "text",
              )
              .map((p) => p.text)
              .join("");

      if (!userText.trim()) return;

      let prompt = userText;
      if (!seedSentRef.current) {
        const seedParts = messagesRef.current
          .filter((m) => m.role === "system")
          .map((m) => (typeof m.content === "string" ? m.content : ""))
          .filter(Boolean);
        if (seedParts.length > 0) {
          prompt = `<lesson-context>\n${seedParts.join("\n")}\n</lesson-context>\n\n${userText}`;
        }
        seedSentRef.current = true;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ThreadMessageLike = {
        role: "user",
        content: userText,
        id: `user-${Date.now()}`,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsRunning(true);
      setError(null);
      streamingTextRef.current = "";

      const assistantId = `assistant-${Date.now()}`;

      try {
        const res = await fetch(new URL("/api/chat", options.baseUrl).toString(), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-companion-session-token": options.sessionToken,
          },
          body: JSON.stringify({
            classId: session.classId,
            date: session.date,
            slotId: session.slotId,
            prompt,
            sessionToken: options.sessionToken,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Chat request failed: ${res.status} ${body}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;

          for (const line of lines) {
            if (!line.trim()) continue;
            let parsed: NdjsonLine;
            try {
              parsed = JSON.parse(line) as NdjsonLine;
            } catch {
              continue;
            }

            if (parsed.type === "stream_event") {
              const ev = (parsed as NdjsonStreamEvent).event;
              if (ev.type === "content_block_start" && ev.content_block?.type === "text" && ev.content_block.text) {
                streamingTextRef.current += ev.content_block.text;
              } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
                streamingTextRef.current += ev.delta.text;
              }
              setMessages((prev) => {
                const existing = prev.findIndex((m) => m.id === assistantId);
                const assistantMsg: ThreadMessageLike = {
                  role: "assistant",
                  content: streamingTextRef.current,
                  id: assistantId,
                  status: { type: "running" },
                };
                if (existing >= 0) {
                  const next = [...prev];
                  next[existing] = assistantMsg;
                  return next;
                }
                return [...prev, assistantMsg];
              });
            } else if (parsed.type === "assistant") {
              const text = extractAssistantText(parsed as NdjsonAssistantMessage);
              if (text) {
                streamingTextRef.current = text;
                setMessages((prev) => {
                  const existing = prev.findIndex((m) => m.id === assistantId);
                  const assistantMsg: ThreadMessageLike = {
                    role: "assistant",
                    content: text,
                    id: assistantId,
                    status: { type: "complete", reason: "stop" },
                  };
                  if (existing >= 0) {
                    const next = [...prev];
                    next[existing] = assistantMsg;
                    return next;
                  }
                  return [...prev, assistantMsg];
                });
              }
            } else if (parsed.type === "companion_turn_complete") {
              const complete = parsed as NdjsonTurnComplete;
              if (complete.notice) {
                noticeRef.current = complete.notice;
              }
            }
          }
        }

        if (streamingTextRef.current) {
          setMessages((prev) => {
            const existing = prev.findIndex((m) => m.id === assistantId);
            const finalMsg: ThreadMessageLike = {
              role: "assistant",
              content: streamingTextRef.current,
              id: assistantId,
              status: { type: "complete", reason: "stop" },
            };
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = finalMsg;
              return next;
            }
            return [...prev, finalMsg];
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = (err as Error).message;
        setError(msg);
        setMessages((prev) => {
          const existing = prev.findIndex((m) => m.id === assistantId);
          const errMsg: ThreadMessageLike = {
            role: "assistant",
            content: `Error: ${msg}`,
            id: assistantId,
            status: { type: "incomplete", reason: "error" },
          };
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = errMsg;
            return next;
          }
          return [...prev, errMsg];
        });
      } finally {
        setIsRunning(false);
      }
    },
    [session, options.baseUrl, options.sessionToken],
  );

  const onCancel = useCallback(async () => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  const setMessagesAdapter = useCallback(
    (msgs: readonly ThreadMessageLike[]) => {
      setMessages([...msgs]);
    },
    [],
  );

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages,
    setMessages: setMessagesAdapter,
    onNew,
    onCancel,
    convertMessage: (msg) => msg,
  });

  const sendMessage = useCallback(
    (text: string) => {
      const msg = {
        parentId: null,
        sourceId: null,
        runConfig: undefined,
        role: "user" as const,
        content: [{ type: "text" as const, text }],
        createdAt: new Date(),
        metadata: { custom: {} },
      };
      void onNew(msg as unknown as AppendMessage);
    },
    [onNew],
  );

  return { runtime, messages, setMessages, sendMessage, isRunning, error, notice: noticeRef.current };
}
