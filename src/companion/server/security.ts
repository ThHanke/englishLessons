import type { IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';

/** KTD9: the per-session token travels as a request header, never a cookie (the browser would
 * attach a cookie automatically to any request, reopening the CSRF hole a token is meant to
 * close). A JSON request body field is also accepted, for callers that prefer to keep it out of
 * headers. */
export const SESSION_TOKEN_HEADER = 'x-companion-session-token';

/** One token per server process (KTD9's "per-session token"): this is a single-teacher local
 * tool with no login/cookie concept, so "session" here means the server process's lifetime, not
 * a per-browser-tab or per-HTTP-session token. Issued once at startup and handed to the UI via
 * `GET /api/session-token` (R10: a distinctly-identifiable, separately-fetchable endpoint, not a
 * value silently embedded in served HTML). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** KTD9: exact-string match only - never a suffix/substring/startsWith check, which a lookalike
 * Origin like `http://127.0.0.1.evil.com` or a DNS-rebinding attacker-controlled host could
 * otherwise defeat. */
export function originMatches(requestOrigin: string | undefined, expectedOrigin: string): boolean {
  return requestOrigin !== undefined && requestOrigin === expectedOrigin;
}

/** Reads the session token from the header first, then an optional parsed JSON body field.
 * Deliberately never reads `req.headers.cookie` - KTD9 requires the token to never travel as an
 * automatically-sent cookie. */
export function extractSessionToken(req: IncomingMessage, body?: Record<string, unknown> | undefined): string | undefined {
  const header = req.headers[SESSION_TOKEN_HEADER];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  const fromBody = body?.sessionToken;
  if (typeof fromBody === 'string' && fromBody.length > 0) {
    return fromBody;
  }
  return undefined;
}

export function tokenMatches(candidate: string | undefined, expected: string): boolean {
  return candidate !== undefined && candidate === expected;
}
