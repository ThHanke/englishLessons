import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { generateSessionToken } from '../security.ts';
import { writeYaml } from '../../../schema/yaml.ts';
import type { CalendarFile } from '../../../schema/types.ts';
import {
  handleSeriesPreviewRequest,
  handleCreateSeriesRequest,
  handleDeleteSeriesRequest,
} from './lessonSeries.ts';

const SESSION_TOKEN_HEADER = 'x-companion-session-token';

function makeCalendar(): CalendarFile {
  return {
    state: 'test-state',
    school_year: '2026/2027',
    first_school_day: '2026-08-03',
    last_school_day: '2026-08-28',
    half_year_boundary: '2026-08-17',
    holidays: [],
    events: [],
    pace_factors: { pre_holiday_days: 0, pre_holiday_factor: 1, post_holiday_days: 0, post_holiday_factor: 1 },
    class_schedule: {
      'test-class': { lesson_days: ['Mon', 'Wed', 'Fri'] },
    },
  };
}

function setupTmpRepo(): { repoRoot: string; cleanup: () => void } {
  const repoRoot = mkdtempSync(join(tmpdir(), 'series-route-test-'));
  mkdirSync(join(repoRoot, 'calendar'), { recursive: true });
  writeYaml(join(repoRoot, 'calendar', 'test-calendar.yaml'), makeCalendar());
  return {
    repoRoot,
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true }),
  };
}

describe('lesson series routes (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  let sessionToken: string;
  let tmpRepo: { repoRoot: string; cleanup: () => void };

  beforeEach(async () => {
    tmpRepo = setupTmpRepo();
    sessionToken = generateSessionToken();

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const config = { repoRoot: tmpRepo.repoRoot, expectedOrigin: origin, sessionToken };

      if (req.method === 'GET' && url.pathname === '/api/lesson-series/preview') {
        void handleSeriesPreviewRequest(req, res, config);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/lesson-series') {
        void handleCreateSeriesRequest(req, res, config);
        return;
      }
      if (req.method === 'DELETE' && url.pathname === '/api/lesson-series') {
        void handleDeleteSeriesRequest(req, res, config);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind test server');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    tmpRepo.cleanup();
  });

  describe('POST /api/lesson-series', () => {
    it('returns 400 with missing required params', async () => {
      const res = await fetch(`${baseUrl}/api/lesson-series`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: baseUrl,
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
        body: JSON.stringify({ className: 'test-class' }), // missing day, start, end, halfYear, from, to
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 with bad className', async () => {
      const res = await fetch(`${baseUrl}/api/lesson-series`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: baseUrl,
          [SESSION_TOKEN_HEADER]: sessionToken,
        },
        body: JSON.stringify({
          className: '../evil',
          day: 'Mon',
          start: '08:00',
          end: '09:30',
          halfYear: 1,
          from: '2026-08-03',
          to: '2026-08-28',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 without UI token', async () => {
      const res = await fetch(`${baseUrl}/api/lesson-series`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: baseUrl,
        },
        body: JSON.stringify({
          className: 'test-class',
          day: 'Mon',
          start: '08:00',
          end: '09:30',
          halfYear: 1,
          from: '2026-08-03',
          to: '2026-08-28',
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/lesson-series', () => {
    it('returns 401 without UI token', async () => {
      const res = await fetch(
        `${baseUrl}/api/lesson-series?class=test-class&slotId=a1b2c3d4-e5f6-7890-abcd-ef1234567890&from=2026-08-03&to=2026-08-28`,
        {
          method: 'DELETE',
          headers: { origin: baseUrl },
        },
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/lesson-series/preview', () => {
    it('returns dates and skipped count', async () => {
      const res = await fetch(
        `${baseUrl}/api/lesson-series/preview?class=test-class&day=Mon&start=08:00&end=09:30&halfYear=1`,
        { headers: { origin: baseUrl } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { dates: string[]; skippedCount: number };
      expect(body.dates.length).toBeGreaterThan(0);
      expect(typeof body.skippedCount).toBe('number');
    });

    it('returns 400 with missing params', async () => {
      const res = await fetch(
        `${baseUrl}/api/lesson-series/preview?class=test-class&day=Mon`,
        { headers: { origin: baseUrl } },
      );
      expect(res.status).toBe(400);
    });
  });
});
