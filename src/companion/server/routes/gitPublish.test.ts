import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { generateSessionToken } from "../security.ts";
import { handleGitStatusRequest, handleGitPublishRequest } from "./gitPublish.ts";

const execFile = promisify(execFileCb);
const SESSION_TOKEN_HEADER = "x-companion-session-token";

async function git(repoRoot: string, args: string[]): Promise<void> {
  await execFile("git", args, { cwd: repoRoot });
}

async function setupTmpRepo(): Promise<{ repoRoot: string; cleanup: () => void }> {
  const repoRoot = mkdtempSync(join(tmpdir(), "git-publish-route-test-"));
  mkdirSync(join(repoRoot, "artifacts"), { recursive: true });
  mkdirSync(join(repoRoot, "calendar"), { recursive: true });
  writeFileSync(join(repoRoot, "artifacts", ".gitkeep"), "");
  writeFileSync(join(repoRoot, "calendar", ".gitkeep"), "");
  await git(repoRoot, ["init", "--initial-branch=main"]);
  await git(repoRoot, ["config", "user.email", "fixture@example.com"]);
  await git(repoRoot, ["config", "user.name", "Fixture Teacher"]);
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "initial"]);
  return {
    repoRoot,
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true }),
  };
}

describe("git publish routes (HTTP)", () => {
  let server: Server;
  let baseUrl: string;
  let sessionToken: string;
  let tmpRepo: { repoRoot: string; cleanup: () => void };

  beforeEach(async () => {
    tmpRepo = await setupTmpRepo();
    sessionToken = generateSessionToken();

    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const config = { repoRoot: tmpRepo.repoRoot, expectedOrigin: origin, sessionToken };

      if (req.method === "GET" && url.pathname === "/api/git-status") {
        void handleGitStatusRequest(req, res, config);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/git-publish") {
        void handleGitPublishRequest(req, res, config);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("failed to bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    tmpRepo.cleanup();
  });

  describe("GET /api/git-status", () => {
    it("returns the status summary with no token required", async () => {
      const res = await fetch(`${baseUrl}/api/git-status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.branch).toBe("main");
      expect(body.changedFiles).toEqual([]);
    });
  });

  describe("POST /api/git-publish", () => {
    it("returns 401 without a UI token", async () => {
      const res = await fetch(`${baseUrl}/api/git-publish`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ message: "test" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 with a mismatched origin", async () => {
      const res = await fetch(`${baseUrl}/api/git-publish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://evil.example.com",
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
        body: JSON.stringify({ message: "test" }),
      });
      expect(res.status).toBe(403);
    });

    it("returns 400 with a missing message", async () => {
      const res = await fetch(`${baseUrl}/api/git-publish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: baseUrl,
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("returns 200 nothing-to-commit when there are no changes", async () => {
      const res = await fetch(`${baseUrl}/api/git-publish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: baseUrl,
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
        body: JSON.stringify({ message: "no-op" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("nothing-to-commit");
    });

    it("commits a real change and reports push-failed (no remote configured)", async () => {
      writeFileSync(join(tmpRepo.repoRoot, "artifacts", "new.json"), "{}");
      const res = await fetch(`${baseUrl}/api/git-publish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: baseUrl,
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
        body: JSON.stringify({ message: "Add new.json" }),
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.status).toBe("push-failed");
      expect(body.commitSha).toMatch(/^[0-9a-f]{40}$/);
    });
  });
});
