import { createServer as createHttpServer } from "node:http";
import type { Server } from "node:http";
import { join } from "node:path";
import { createServer as createViteServer } from "vite";
import type { ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { generateSessionToken } from "./security.ts";
import { handleCalendarRequest } from "./routes/calendar.ts";
import { handleChatRequest } from "./routes/chat.ts";
import { handleTasksRequest } from "./routes/tasks.ts";
import { handleLessonPreviewRequest } from "./routes/lessonPreview.ts";
import { handleArtifactsRequest } from "./routes/artifacts.ts";
import {
  handleCalendarsListRequest,
  handleCalendarIcsRequest,
} from "./routes/calendars.ts";
import {
  handleSeriesPreviewRequest,
  handleCreateSeriesRequest,
  handleDeleteSeriesRequest,
} from "./routes/lessonSeries.ts";
import { handleRescheduleLessonRequest } from "./routes/rescheduleLesson.ts";

const DEFAULT_REPO_ROOT = new URL("../../../", import.meta.url).pathname;

/** KTD1/R4: loopback only, never `0.0.0.0` or an omitted host - this is a single-teacher local
 * tool, not something that should ever be reachable from the LAN. */
const HOST = "127.0.0.1";

export interface CompanionServerHandle {
  server: Server;
  vite: ViteDevServer;
  /** `http://127.0.0.1:<port>` - also the server's own served origin, used both as the URL a
   * test/caller connects to and as the exact-match value `/api/chat` checks incoming `Origin`
   * headers against (KTD9). */
  url: string;
  /** The per-process session token (security.ts's `generateSessionToken`), also fetchable via
   * `GET /api/session-token` (R10). Exposed here too so a same-process caller (e.g. an
   * integration test) doesn't have to round-trip an HTTP request just to learn it. */
  sessionToken: string;
  close: () => Promise<void>;
}

/**
 * Boots the companion's single Node process (KTD1): Vite in middleware mode for the built UI,
 * plus three plain Node handlers mounted ahead of Vite's own middleware chain for
 * `/api/calendar`, `/api/session-token`, and `/api/chat`. Routing is a manual pathname check in
 * one request listener, rather than `vite.middlewares.use(path, handler)`, so route ordering
 * relative to Vite's internal middlewares (asset serving, HTML fallback) is never a concern -
 * every request either matches one of the three API paths explicitly or falls through to Vite
 * unchanged.
 *
 * `root: src/companion/web` (its `index.html`/`main.tsx`) with `appType: 'spa'`, so Vite serves
 * the built UI and falls back to `index.html` for client-side routes; the three API paths are
 * matched explicitly ahead of Vite's own middleware chain, so route ordering relative to Vite's
 * internals (asset serving, HTML fallback) is never a concern.
 *
 * `port: 0` (the default) binds an OS-assigned ephemeral port so parallel test runs never
 * collide on a fixed port; pass an explicit port to run the companion for real use.
 */
export async function createCompanionServer(params?: {
  port?: number;
  repoRoot?: string;
}): Promise<CompanionServerHandle> {
  const repoRoot = params?.repoRoot ?? DEFAULT_REPO_ROOT;
  const sessionToken = generateSessionToken();
  let origin = "";

  const vite = await createViteServer({
    root: join(repoRoot, "src/companion/web"),
    configFile: false,
    appType: "spa",
    plugins: [react(), tailwindcss()],
    server: { middlewareMode: true, host: HOST },
  });

  const httpServer = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);

    if (req.method === "GET" && url.pathname === "/api/session-token") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          token: sessionToken,
          issuedAt: new Date().toISOString(),
        }),
      );
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/calendar") {
      void handleCalendarRequest(req, res, { repoRoot });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/tasks") {
      void handleTasksRequest(req, res, { repoRoot });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/lesson-preview") {
      void handleLessonPreviewRequest(req, res, { repoRoot });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/artifacts/")) {
      void handleArtifactsRequest(req, res, { repoRoot, expectedOrigin: origin });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/calendars") {
      void handleCalendarsListRequest(req, res, { repoRoot, expectedOrigin: origin });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/calendars/")) {
      void handleCalendarIcsRequest(req, res, { repoRoot, expectedOrigin: origin });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/lesson-series/preview") {
      void handleSeriesPreviewRequest(req, res, { repoRoot });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/lesson-series") {
      void handleCreateSeriesRequest(req, res, {
        repoRoot,
        expectedOrigin: origin,
        sessionToken,
      });
      return;
    }
    if (req.method === "DELETE" && url.pathname === "/api/lesson-series") {
      void handleDeleteSeriesRequest(req, res, {
        repoRoot,
        expectedOrigin: origin,
        sessionToken,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/reschedule-lesson") {
      void handleRescheduleLessonRequest(req, res, {
        repoRoot,
        expectedOrigin: origin,
        sessionToken,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      void handleChatRequest(req, res, {
        expectedOrigin: origin,
        sessionToken,
        cwd: repoRoot,
      });
      return;
    }

    vite.middlewares(req, res);
  });

  const port = params?.port ?? 0;
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, HOST, () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Companion server failed to bind to a TCP port.");
  }
  origin = `http://${HOST}:${address.port}`;

  return {
    server: httpServer,
    vite,
    url: origin,
    sessionToken,
    close: async () => {
      await vite.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
