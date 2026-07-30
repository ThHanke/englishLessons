import type { IncomingMessage, ServerResponse } from "node:http";
import { originMatches, extractSessionToken, tokenMatches } from "../security.ts";
import { gitStatusSummary, publishChanges } from "../gitPublish.ts";

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleGitStatusRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string },
): Promise<void> {
  try {
    const summary = await gitStatusSummary(config.repoRoot);
    sendJson(res, 200, summary);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}

export async function handleGitPublishRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string; expectedOrigin: string; sessionToken: string },
): Promise<void> {
  const originHeader = req.headers.origin;
  if (
    !originMatches(typeof originHeader === "string" ? originHeader : undefined, config.expectedOrigin)
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

  const message = typeof body.message === "string" ? body.message : undefined;
  if (!message || message.trim().length === 0) {
    sendJson(res, 400, { error: "missing_message" });
    return;
  }

  try {
    const result = await publishChanges({ repoRoot: config.repoRoot, message });
    const statusCode = result.status === "commit-failed" || result.status === "push-failed" ? 500 : 200;
    sendJson(res, statusCode, result);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}
