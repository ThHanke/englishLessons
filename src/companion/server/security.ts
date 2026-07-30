import type { IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";

/** KTD9: the per-session token travels as a request header, never a cookie (the browser would
 * attach a cookie automatically to any request, reopening the CSRF hole a token is meant to
 * close). A JSON request body field is also accepted, for callers that prefer to keep it out of
 * headers. */
export const SESSION_TOKEN_HEADER = "x-companion-session-token";

/** One token per server process (KTD9's "per-session token"): this is a single-teacher local
 * tool with no login/cookie concept, so "session" here means the server process's lifetime, not
 * a per-browser-tab or per-HTTP-session token. Issued once at startup and handed to the UI via
 * `GET /api/session-token` (R10: a distinctly-identifiable, separately-fetchable endpoint, not a
 * value silently embedded in served HTML). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** `127.0.0.1` and `localhost` are the only two loopback spellings a browser can send for this
 * server (it binds `127.0.0.1` only, per KTD1) -- both fixed, non-attacker-controllable hostnames,
 * unlike a DNS-rebinding target. Treating them as equivalent is not a substring/wildcard leniency:
 * it's still exact membership in this two-element set, just normalized to one canonical spelling
 * first. Returns null (never matches) for anything else, including an unparseable origin. */
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

function normalizedLoopbackOrigin(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) return null;
  return `${url.protocol}//127.0.0.1:${url.port}`;
}

/** KTD9: exact-string match only - never a suffix/substring/startsWith check, which a lookalike
 * Origin like `http://127.0.0.1.evil.com` or a DNS-rebinding attacker-controlled host could
 * otherwise defeat. The one deliberate exception is `localhost` vs `127.0.0.1` for the same
 * port, normalized via `normalizedLoopbackOrigin` above -- still exact matching, just against a
 * two-spelling set instead of one, so a teacher who typed `localhost:<port>` isn't rejected by
 * the same server they were issued the token from. */
export function originMatches(
  requestOrigin: string | undefined,
  expectedOrigin: string,
): boolean {
  if (requestOrigin === undefined) return false;
  if (requestOrigin === expectedOrigin) return true;
  const normalizedRequest = normalizedLoopbackOrigin(requestOrigin);
  if (normalizedRequest === null) return false;
  return normalizedRequest === normalizedLoopbackOrigin(expectedOrigin);
}

/** Same-origin check for a route reached by direct browser navigation (a teacher clicking
 * `<a href target="_blank">` to open a generated material), not by `fetch`/XHR -- a plain
 * top-level GET navigation commonly carries no `Origin` header at all (browsers only reliably
 * attach it to fetch/XHR and unsafe-method requests), so `originMatches`' "missing Origin ->
 * reject" rule would 403 every legitimate click. A *present* Origin still has to match exactly
 * (via `originMatches`) -- this only widens the missing-header case, which is the one a
 * cross-origin `fetch`/XHR/iframe attack can't produce (those always send a real Origin), so the
 * protection `originMatches`' doc comment describes is unchanged for the attack it's guarding
 * against. */
export function originMatchesOrAbsent(
  requestOrigin: string | undefined,
  expectedOrigin: string,
): boolean {
  return requestOrigin === undefined || originMatches(requestOrigin, expectedOrigin);
}

/** Reads the session token from the header first, then an optional parsed JSON body field.
 * Deliberately never reads `req.headers.cookie` - KTD9 requires the token to never travel as an
 * automatically-sent cookie. */
export function extractSessionToken(
  req: IncomingMessage,
  body?: Record<string, unknown> | undefined,
): string | undefined {
  const header = req.headers[SESSION_TOKEN_HEADER];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  const fromBody = body?.sessionToken;
  if (typeof fromBody === "string" && fromBody.length > 0) {
    return fromBody;
  }
  return undefined;
}

export function tokenMatches(
  candidate: string | undefined,
  expected: string,
): boolean {
  return candidate !== undefined && candidate === expected;
}
