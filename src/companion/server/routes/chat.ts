import type { IncomingMessage, ServerResponse } from "node:http";
import { runAgentTurnStream } from "../agentSession.ts";
import {
  extractSessionToken,
  originMatches,
  tokenMatches,
} from "../security.ts";

export interface ChatRouteConfig {
  expectedOrigin: string;
  sessionToken: string;
  cwd: string;
}

/** Synthetic wire-only message appended after the Agent SDK's stream is fully consumed, carrying
 * `runAgentTurnStream`'s generator return value (`AgentTurnStreamResult`) to the client. This is
 * a wire-format addition only - it is never smuggled into `agentSession.ts`'s `SDKMessage`
 * stream itself, matching that module's own doc comment about keeping its stream type clean. */
export interface ChatTurnCompleteMessage {
  type: "companion_turn_complete";
  sessionId: string;
  startedFresh: boolean;
  notice?: string;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * `POST /api/chat`. Wire format: newline-delimited JSON (NDJSON) - one JSON object per line,
 * flushed as each `SDKMessage` arrives from `runAgentTurnStream`, followed by one final
 * `ChatTurnCompleteMessage` line once the generator returns. NDJSON over SSE: the payloads are
 * already discrete SDK message objects with no need for SSE's event-name/id framing, and NDJSON
 * is trivially parsed by a `ReadableStream` reader on the frontend (U5) without an EventSource
 * polyfill.
 *
 * Origin and session-token validation happen first, before the request body is parsed for
 * `classId`/`date`/`prompt` and before `runAgentTurnStream` is ever called - a rejected request
 * never touches the Agent SDK.
 */
export async function handleChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: ChatRouteConfig,
): Promise<void> {
  const originHeader = req.headers.origin;
  if (
    !originMatches(
      typeof originHeader === "string" ? originHeader : undefined,
      config.expectedOrigin,
    )
  ) {
    sendJson(res, 403, { error: "origin_rejected" });
    return;
  }

  const body = await readJsonBody(req);
  const token = extractSessionToken(req, body);
  if (!tokenMatches(token, config.sessionToken)) {
    sendJson(res, 401, { error: "invalid_session_token" });
    return;
  }

  const classId = typeof body.classId === "string" ? body.classId : undefined;
  const date = typeof body.date === "string" ? body.date : undefined;
  const slotId = typeof body.slotId === "string" ? body.slotId : undefined;
  const prompt = typeof body.prompt === "string" ? body.prompt : undefined;
  if (!classId || !date || !prompt) {
    sendJson(res, 400, {
      error: "missing_fields",
      required: ["classId", "date", "prompt"],
    });
    return;
  }

  res.writeHead(200, {
    "content-type": "application/x-ndjson",
    "cache-control": "no-cache",
  });

  const stream = runAgentTurnStream({ classId, date, slotId, prompt, cwd: config.cwd });
  // Manual `.next()` loop (not `for await...of`) so the generator's return value - the final
  // `{ done: true, value }` - is captured rather than discarded, per agentSession.ts's own doc
  // comment on `AgentTurnStreamResult`.
  let step = await stream.next();
  while (!step.done) {
    res.write(`${JSON.stringify(step.value)}\n`);
    step = await stream.next();
  }
  const complete: ChatTurnCompleteMessage = {
    type: "companion_turn_complete",
    ...step.value,
  };
  res.write(`${JSON.stringify(complete)}\n`);
  res.end();
}
