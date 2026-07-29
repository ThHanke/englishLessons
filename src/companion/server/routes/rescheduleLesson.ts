import type { IncomingMessage, ServerResponse } from "node:http";
import {
  originMatches,
  extractSessionToken,
  tokenMatches,
} from "../security.ts";
import { rescheduleLesson } from "../rescheduleLesson.ts";

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
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * `POST /api/reschedule-lesson`: moves an already-generated lesson's content to a new date
 * (calendar drag-to-reschedule) without losing it. Thin request-parsing wrapper around
 * `rescheduleLesson` -- all path-safety validation lives there since that's what actually
 * touches the filesystem.
 */
export async function handleRescheduleLessonRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string; expectedOrigin: string; sessionToken: string },
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

  const className =
    typeof body.className === "string" ? body.className : undefined;
  const fromDate =
    typeof body.fromDate === "string" ? body.fromDate : undefined;
  const toDate = typeof body.toDate === "string" ? body.toDate : undefined;
  const slotId = typeof body.slotId === "string" ? body.slotId : undefined;

  if (!className || !fromDate || !toDate) {
    sendJson(res, 400, {
      error: "missing_fields",
      required: ["className", "fromDate", "toDate"],
    });
    return;
  }

  const result = rescheduleLesson({
    className,
    fromDate,
    toDate,
    slotId,
    repoRoot: config.repoRoot,
  });

  if (!result.moved) {
    sendJson(res, 409, { error: result.error });
    return;
  }

  sendJson(res, 200, { moved: true, className, fromDate, toDate, slotId });
}
