import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadYaml } from '../../../schema/yaml.ts';
import type { CalendarFile, LessonSlot } from '../../../schema/types.ts';
import { moduleTasks } from '../moduleTasks.ts';
import type { TasksRangeResponse } from './tasks.ts';
import { originMatches, extractSessionToken, tokenMatches } from '../security.ts';
import {
  validateSeriesInput,
  validateSlotId,
  seriesPreview,
  persistSeries,
  deleteSeries,
} from '../seriesGeneration.ts';

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function loadFirstCalendar(repoRoot: string): { calendar: CalendarFile; path: string } | null {
  const calendarDir = join(repoRoot, 'calendar');
  const files = readdirSync(calendarDir).filter(f => f.endsWith('.yaml'));
  for (const file of files) {
    const filePath = join(calendarDir, file);
    const calendar = loadYaml<CalendarFile>(filePath);
    if (calendar.class_schedule) return { calendar, path: filePath };
  }
  return null;
}

function findCalendarForClass(className: string, repoRoot: string): { calendar: CalendarFile; path: string } | null {
  const calendarDir = join(repoRoot, 'calendar');
  const files = readdirSync(calendarDir).filter(f => f.endsWith('.yaml'));
  for (const file of files) {
    const filePath = join(calendarDir, file);
    const calendar = loadYaml<CalendarFile>(filePath);
    if (calendar.class_schedule[className]) return { calendar, path: filePath };
  }
  return null;
}

export interface SeriesRouteConfig {
  repoRoot: string;
  expectedOrigin: string;
  sessionToken?: string;
}

export async function handleSeriesPreviewRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string; expectedOrigin: string },
): Promise<void> {
  const originHeader = req.headers.origin;
  if (!originMatches(typeof originHeader === 'string' ? originHeader : undefined, config.expectedOrigin)) {
    sendJson(res, 403, { error: 'origin_rejected' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const className = url.searchParams.get('class');
  const day = url.searchParams.get('day');
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const halfYearRaw = url.searchParams.get('halfYear');

  if (!className || !day || !start || !end || !halfYearRaw) {
    sendJson(res, 400, { error: 'missing_query_params', required: ['class', 'day', 'start', 'end', 'halfYear'] });
    return;
  }

  const halfYear = Number(halfYearRaw);
  const validation = validateSeriesInput({ className, day, start, end, halfYear });
  if (!validation.valid) {
    sendJson(res, 400, { error: validation.error });
    return;
  }

  try {
    const result = loadFirstCalendar(config.repoRoot);
    if (!result) {
      sendJson(res, 500, { error: 'no calendar file found' });
      return;
    }

    const preview = seriesPreview({
      calendar: result.calendar,
      className,
      day,
      start,
      end,
      halfYear: halfYear as 1 | 2,
    });
    sendJson(res, 200, preview);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}

export async function handleCreateSeriesRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string; expectedOrigin: string; sessionToken: string },
): Promise<void> {
  const originHeader = req.headers.origin;
  if (!originMatches(typeof originHeader === 'string' ? originHeader : undefined, config.expectedOrigin)) {
    sendJson(res, 403, { error: 'origin_rejected' });
    return;
  }

  const body = await readJsonBody(req);
  const token = extractSessionToken(req, body);
  if (!tokenMatches(token, config.sessionToken)) {
    sendJson(res, 401, { error: 'invalid_session_token' });
    return;
  }

  const className = typeof body.className === 'string' ? body.className : undefined;
  const day = typeof body.day === 'string' ? body.day : undefined;
  const start = typeof body.start === 'string' ? body.start : undefined;
  const end = typeof body.end === 'string' ? body.end : undefined;
  const halfYearRaw = typeof body.halfYear === 'number' ? body.halfYear : undefined;
  const from = typeof body.from === 'string' ? body.from : undefined;
  const to = typeof body.to === 'string' ? body.to : undefined;

  if (!className || !day || !start || !end || halfYearRaw === undefined || !from || !to) {
    sendJson(res, 400, { error: 'missing_fields', required: ['className', 'day', 'start', 'end', 'halfYear', 'from', 'to'] });
    return;
  }

  const validation = validateSeriesInput({ className, day, start, end, halfYear: halfYearRaw });
  if (!validation.valid) {
    sendJson(res, 400, { error: validation.error });
    return;
  }

  try {
    const calResult = findCalendarForClass(className, config.repoRoot) ?? loadFirstCalendar(config.repoRoot);
    if (!calResult) {
      sendJson(res, 500, { error: 'no calendar file found' });
      return;
    }

    const slot: LessonSlot = {
      id: randomUUID(),
      day,
      start,
      end,
      half_year: halfYearRaw as 1 | 2,
    };

    await persistSeries({ calendarPath: calResult.path, className, slot });

    const { classes, tasks, appointments } = moduleTasks({ from, to, repoRoot: config.repoRoot });
    sendJson(res, 200, { from, to, classes, tasks, appointments } satisfies TasksRangeResponse);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}

export async function handleDeleteSeriesRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string; expectedOrigin: string; sessionToken: string },
): Promise<void> {
  const originHeader = req.headers.origin;
  if (!originMatches(typeof originHeader === 'string' ? originHeader : undefined, config.expectedOrigin)) {
    sendJson(res, 403, { error: 'origin_rejected' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  // Extract session token from header (DELETE has no body)
  const token = extractSessionToken(req);
  if (!tokenMatches(token, config.sessionToken)) {
    sendJson(res, 401, { error: 'invalid_session_token' });
    return;
  }

  const className = url.searchParams.get('class');
  const slotId = url.searchParams.get('slotId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!className || !slotId || !from || !to) {
    sendJson(res, 400, { error: 'missing_query_params', required: ['class', 'slotId', 'from', 'to'] });
    return;
  }

  const slotValidation = validateSlotId(slotId);
  if (!slotValidation.valid) {
    sendJson(res, 400, { error: slotValidation.error });
    return;
  }

  try {
    const calResult = findCalendarForClass(className, config.repoRoot) ?? loadFirstCalendar(config.repoRoot);
    if (!calResult) {
      sendJson(res, 500, { error: 'no calendar file found' });
      return;
    }

    await deleteSeries({ calendarPath: calResult.path, className, slotId });

    const { classes, tasks, appointments } = moduleTasks({ from, to, repoRoot: config.repoRoot });
    sendJson(res, 200, { from, to, classes, tasks, appointments } satisfies TasksRangeResponse);
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}
