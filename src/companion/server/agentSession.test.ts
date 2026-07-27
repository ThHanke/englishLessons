import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Options, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>();
  return {
    ...actual,
    query: queryMock,
  };
});

const ORIGINAL_ENV = { ...process.env };
const REPO_CWD = "/repo/root";

function isolateConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "companion-agent-session-"));
  process.env.XDG_CONFIG_HOME = dir;
  return dir;
}

function resultMessage(
  sessionId: string,
  overrides: Partial<SDKResultMessage> = {},
): SDKResultMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 10,
    duration_api_ms: 10,
    is_error: false,
    num_turns: 1,
    result: "ok",
    stop_reason: null,
    total_cost_usd: 0,
    usage: {} as SDKResultMessage["usage"],
    modelUsage: {},
    permission_denials: [],
    uuid: randomUUID(),
    session_id: sessionId,
    ...overrides,
  } as SDKResultMessage;
}

function fakeStream(messages: unknown[]): AsyncGenerator<unknown> {
  return (async function* () {
    for (const message of messages) yield message;
  })();
}

function fakeThrowingStream(err: Error): AsyncGenerator<unknown> {
  return (async function* () {
    throw err;
  })();
}

describe("agentSession", () => {
  let tmpDirs: string[] = [];

  beforeEach(async () => {
    tmpDirs = [];
    delete process.env.XDG_CONFIG_HOME;
    queryMock.mockReset();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("calls query() without resume for a new class+date and persists the returned session id", async () => {
    tmpDirs.push(isolateConfigDir());
    const { runAgentTurn } = await import("./agentSession.ts");
    const { getSessionId } = await import("./sessionIndex.ts");
    queryMock.mockReturnValue(fakeStream([resultMessage("brand-new-session")]));

    const outcome = await runAgentTurn({
      classId: "grade5a",
      date: "2026-09-01",
      prompt: "hi",
      cwd: REPO_CWD,
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const options = queryMock.mock.calls[0]![0].options as Options;
    expect(options.resume).toBeUndefined();
    expect(outcome.sessionId).toBe("brand-new-session");
    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-01" }),
    ).resolves.toBe("brand-new-session");
  });

  it("calls query() with resume: <stored id> for an existing class+date", async () => {
    tmpDirs.push(isolateConfigDir());
    const { runAgentTurn } = await import("./agentSession.ts");
    const { setSessionId } = await import("./sessionIndex.ts");
    await setSessionId({
      classId: "grade5a",
      date: "2026-09-01",
      sessionId: "prior-session",
    });
    queryMock.mockReturnValue(fakeStream([resultMessage("prior-session")]));

    await runAgentTurn({
      classId: "grade5a",
      date: "2026-09-01",
      prompt: "continue",
      cwd: REPO_CWD,
    });

    const options = queryMock.mock.calls[0]![0].options as Options;
    expect(options.resume).toBe("prior-session");
  });

  it("keeps two different dates for the same class as distinct index entries", async () => {
    tmpDirs.push(isolateConfigDir());
    const { runAgentTurn } = await import("./agentSession.ts");
    const { getSessionId } = await import("./sessionIndex.ts");
    queryMock
      .mockReturnValueOnce(fakeStream([resultMessage("session-mon")]))
      .mockReturnValueOnce(fakeStream([resultMessage("session-wed")]));

    await runAgentTurn({
      classId: "grade5a",
      date: "2026-09-01",
      prompt: "a",
      cwd: REPO_CWD,
    });
    await runAgentTurn({
      classId: "grade5a",
      date: "2026-09-03",
      prompt: "b",
      cwd: REPO_CWD,
    });

    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-01" }),
    ).resolves.toBe("session-mon");
    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-03" }),
    ).resolves.toBe("session-wed");
  });

  it("always includes Edit/Write/MultiEdit/NotebookEdit/Bash in disallowedTools", async () => {
    tmpDirs.push(isolateConfigDir());
    const { runAgentTurn } = await import("./agentSession.ts");
    queryMock.mockReturnValue(fakeStream([resultMessage("s1")]));

    await runAgentTurn({
      classId: "grade5a",
      date: "2026-09-01",
      prompt: "hi",
      cwd: REPO_CWD,
    });

    const options = queryMock.mock.calls[0]![0].options as Options;
    expect(options.disallowedTools).toEqual(
      expect.arrayContaining([
        "Edit",
        "Write",
        "MultiEdit",
        "NotebookEdit",
        "Bash",
      ]),
    );
  });

  it("always passes the exact cwd and settingSources on every call", async () => {
    tmpDirs.push(isolateConfigDir());
    const { runAgentTurn } = await import("./agentSession.ts");
    queryMock.mockReturnValue(fakeStream([resultMessage("s1")]));

    await runAgentTurn({
      classId: "grade5a",
      date: "2026-09-01",
      prompt: "hi",
      cwd: REPO_CWD,
    });

    const options = queryMock.mock.calls[0]![0].options as Options;
    expect(options.cwd).toBe(REPO_CWD);
    expect(options.settingSources).toEqual(["user", "project"]);
  });

  it("does not terminate the conversation when a mid-conversation tool-result is a denied write", async () => {
    tmpDirs.push(isolateConfigDir());
    const { runAgentTurn } = await import("./agentSession.ts");
    const deniedToolResult = {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            is_error: true,
            content: "Permission denied: Write is disallowed",
          },
        ],
      },
      session_id: "s1",
    };
    queryMock.mockReturnValue(
      fakeStream([
        deniedToolResult,
        resultMessage("s1", {
          permission_denials: [
            { tool_name: "Write", tool_use_id: "x", tool_input: {} },
          ] as never,
        }),
      ]),
    );

    const outcome = await runAgentTurn({
      classId: "grade5a",
      date: "2026-09-01",
      prompt: "edit the file",
      cwd: REPO_CWD,
    });

    expect(outcome.result.permission_denials.length).toBeGreaterThan(0);
    expect(outcome.sessionId).toBe("s1");
  });

  it("starts a fresh session with a notice when resuming a stored id fails (missing/corrupted transcript)", async () => {
    tmpDirs.push(isolateConfigDir());
    const { runAgentTurn } = await import("./agentSession.ts");
    const { setSessionId, getSessionId } = await import("./sessionIndex.ts");
    await setSessionId({
      classId: "grade5a",
      date: "2026-09-01",
      sessionId: "broken-session",
    });

    queryMock.mockImplementation((params: { options: Options }) => {
      if (params.options.resume === "broken-session") {
        return fakeThrowingStream(new Error("session transcript not found"));
      }
      return fakeStream([resultMessage("fresh-session")]);
    });

    const outcome = await runAgentTurn({
      classId: "grade5a",
      date: "2026-09-01",
      prompt: "hi",
      cwd: REPO_CWD,
    });

    expect(outcome.startedFresh).toBe(true);
    expect(outcome.notice).toMatch(/fresh session/i);
    expect(outcome.sessionId).toBe("fresh-session");
    expect(queryMock).toHaveBeenCalledTimes(2);
    await expect(
      getSessionId({ classId: "grade5a", date: "2026-09-01" }),
    ).resolves.toBe("fresh-session");
  });

  it("does not corrupt the index when two overlapping requests hit the same class+date", async () => {
    const dir = isolateConfigDir();
    tmpDirs.push(dir);
    const { runAgentTurn } = await import("./agentSession.ts");
    const { getSessionIndexPath } = await import("./sessionIndex.ts");
    queryMock
      .mockReturnValueOnce(fakeStream([resultMessage("race-a")]))
      .mockReturnValueOnce(fakeStream([resultMessage("race-b")]));

    await Promise.all([
      runAgentTurn({
        classId: "grade5a",
        date: "2026-09-01",
        prompt: "a",
        cwd: REPO_CWD,
      }),
      runAgentTurn({
        classId: "grade5a",
        date: "2026-09-01",
        prompt: "b",
        cwd: REPO_CWD,
      }),
    ]);

    const raw = readFileSync(getSessionIndexPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    expect(["race-a", "race-b"]).toContain(parsed["grade5a::2026-09-01"]);
  });
});
