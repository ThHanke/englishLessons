import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: queryMock,
}));

const FIXTURE_REPO_ROOT = new URL('./fixtures/repo/', import.meta.url).pathname;
const SESSION_TOKEN_HEADER = 'x-companion-session-token';
const ORIGINAL_ENV = { ...process.env };

function resultMessage(sessionId: string, overrides: Partial<SDKResultMessage> = {}): SDKResultMessage {
  return {
    type: 'result',
    subtype: 'success',
    duration_ms: 10,
    duration_api_ms: 10,
    is_error: false,
    num_turns: 1,
    result: 'ok',
    stop_reason: null,
    total_cost_usd: 0,
    usage: {} as SDKResultMessage['usage'],
    modelUsage: {},
    permission_denials: [],
    uuid: randomUUID(),
    session_id: sessionId,
    ...overrides,
  } as SDKResultMessage;
}

/** Yields two assistant chunks with a macrotask gap between them (setTimeout 0), so the two
 * `res.write()` calls they trigger land on separate ticks and are observably separate chunks
 * over the wire rather than something Node might coalesce if written back-to-back synchronously. */
function fakeAssistantStream(sessionId: string): AsyncGenerator<unknown> {
  return (async function* () {
    yield { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'chunk one' }] } };
    await new Promise((resolve) => setTimeout(resolve, 5));
    yield { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'chunk two' }] } };
    await new Promise((resolve) => setTimeout(resolve, 5));
    yield resultMessage(sessionId);
  })();
}

describe('companion server (integration)', () => {
  let tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDirs = [];
    delete process.env.XDG_CONFIG_HOME;
    const dir = mkdtempSync(join(tmpdir(), 'companion-index-'));
    process.env.XDG_CONFIG_HOME = dir;
    tmpDirs.push(dir);
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

  it('binds to 127.0.0.1 only, on an ephemeral (non-fixed) port', async () => {
    const { createCompanionServer } = await import('./index.ts');
    const handle = await createCompanionServer({ port: 0, repoRoot: FIXTURE_REPO_ROOT });
    try {
      const address = handle.server.address();
      if (!address || typeof address === 'string') throw new Error('server did not bind a TCP address');
      expect(address.address).toBe('127.0.0.1');
      expect(address.port).toBeGreaterThan(0);
      expect(handle.url).toBe(`http://127.0.0.1:${address.port}`);
    } finally {
      await handle.close();
    }
  });

  it('issues a session token via a distinctly-fetchable GET /api/session-token endpoint (R10)', async () => {
    const { createCompanionServer } = await import('./index.ts');
    const handle = await createCompanionServer({ port: 0, repoRoot: FIXTURE_REPO_ROOT });
    try {
      const res = await fetch(`${handle.url}/api/session-token`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      expect(body.token).toBe(handle.sessionToken);
    } finally {
      await handle.close();
    }
  });

  it('GET /api/calendar returns module/phase/gap data for a date range', async () => {
    const { createCompanionServer } = await import('./index.ts');
    const handle = await createCompanionServer({ port: 0, repoRoot: FIXTURE_REPO_ROOT });
    try {
      const res = await fetch(`${handle.url}/api/calendar?class=fixture-class&from=2026-08-03&to=2026-08-03`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { days: Array<{ moduleId: string | null }> };
      expect(body.days[0]!.moduleId).toBe('m1');
    } finally {
      await handle.close();
    }
  });

  it('rejects a POST /api/chat request with a missing Origin header (403), before the Agent SDK is invoked', async () => {
    const { createCompanionServer } = await import('./index.ts');
    const handle = await createCompanionServer({ port: 0, repoRoot: FIXTURE_REPO_ROOT });
    try {
      const res = await fetch(`${handle.url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SESSION_TOKEN_HEADER]: handle.sessionToken },
        body: JSON.stringify({ classId: 'fixture-class', date: '2026-08-03', prompt: 'hi' }),
      });
      expect(res.status).toBe(403);
      expect(queryMock).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('rejects a lookalike/subdomain Origin (KTD9), not just a missing or obviously-wrong one', async () => {
    const { createCompanionServer } = await import('./index.ts');
    const handle = await createCompanionServer({ port: 0, repoRoot: FIXTURE_REPO_ROOT });
    try {
      const res = await fetch(`${handle.url}/api/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: `${handle.url}.evil.com`,
          [SESSION_TOKEN_HEADER]: handle.sessionToken,
        },
        body: JSON.stringify({ classId: 'fixture-class', date: '2026-08-03', prompt: 'hi' }),
      });
      expect(res.status).toBe(403);
      expect(queryMock).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('rejects a missing/invalid per-session token (401) from the correct origin', async () => {
    const { createCompanionServer } = await import('./index.ts');
    const handle = await createCompanionServer({ port: 0, repoRoot: FIXTURE_REPO_ROOT });
    try {
      const res = await fetch(`${handle.url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: handle.url, [SESSION_TOKEN_HEADER]: 'wrong-token' },
        body: JSON.stringify({ classId: 'fixture-class', date: '2026-08-03', prompt: 'hi' }),
      });
      expect(res.status).toBe(401);
      expect(queryMock).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('never accepts the session token via an automatically-sent cookie (KTD9)', async () => {
    const { createCompanionServer } = await import('./index.ts');
    const handle = await createCompanionServer({ port: 0, repoRoot: FIXTURE_REPO_ROOT });
    try {
      const res = await fetch(`${handle.url}/api/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: handle.url,
          cookie: `companionToken=${handle.sessionToken}`,
        },
        body: JSON.stringify({ classId: 'fixture-class', date: '2026-08-03', prompt: 'hi' }),
      });
      expect(res.status).toBe(401);
      expect(queryMock).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('streams incremental assistant output over multiple chunks for a valid request, not one buffered response', async () => {
    queryMock.mockReturnValue(fakeAssistantStream('chat-session-1'));
    const { createCompanionServer } = await import('./index.ts');
    const handle = await createCompanionServer({ port: 0, repoRoot: FIXTURE_REPO_ROOT });
    try {
      const res = await fetch(`${handle.url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: handle.url, [SESSION_TOKEN_HEADER]: handle.sessionToken },
        body: JSON.stringify({ classId: 'fixture-class', date: '2026-08-03', prompt: 'plan this lesson' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/ndjson/);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const rawChunks: string[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rawChunks.push(decoder.decode(value, { stream: true }));
      }

      // Multiple distinct reads from the response body stream, not one single buffered chunk.
      expect(rawChunks.length).toBeGreaterThan(1);

      const lines = rawChunks.join('').split('\n').filter(Boolean);
      const parsed = lines.map((l) => JSON.parse(l) as { type: string });
      expect(parsed.some((m) => m.type === 'assistant')).toBe(true);
      const complete = parsed.find((m) => m.type === 'companion_turn_complete') as
        | { type: string; sessionId: string; startedFresh: boolean }
        | undefined;
      expect(complete).toBeDefined();
      expect(complete!.sessionId).toBe('chat-session-1');
      expect(complete!.startedFresh).toBe(false);

      expect(queryMock).toHaveBeenCalledTimes(1);
    } finally {
      await handle.close();
    }
  });
});
