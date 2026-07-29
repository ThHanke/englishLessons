import type { IncomingMessage, ServerResponse } from "node:http";
import { dateContext } from "../dateContext.ts";
import type { DateContext } from "../dateContext.ts";

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * `GET /api/lesson-preview?class=<className>&date=<YYYY-MM-DD>` — the same seed context R2's
 * chat-open flow assembles (`dateContext`), exposed so the "Plan lesson" form (R11) can preview
 * what a chat session for that grade+date would start from (module, phase, gaps, any existing
 * `lesson-spec.json`) before the teacher commits to opening it.
 */
export async function handleLessonPreviewRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot?: string },
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const className = url.searchParams.get("class");
  const date = url.searchParams.get("date");
  const slotId = url.searchParams.get("slotId") ?? undefined;

  if (!className || !date) {
    sendJson(res, 400, {
      error: "missing_query_params",
      required: ["class", "date"],
    });
    return;
  }

  try {
    const context: DateContext = dateContext({
      className,
      date,
      slotId,
      repoRoot: config.repoRoot,
    });
    sendJson(res, 200, context);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}
