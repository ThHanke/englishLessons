import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import {
  SESSION_TOKEN_HEADER,
  extractSessionToken,
  generateSessionToken,
  originMatches,
  tokenMatches,
} from './security.ts';

function fakeRequest(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe('security', () => {
  describe('generateSessionToken', () => {
    it('produces a non-empty, non-guessable-length token that differs on each call', () => {
      const a = generateSessionToken();
      const b = generateSessionToken();
      expect(a).not.toBe(b);
      expect(a.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('originMatches', () => {
    it('accepts an exact-match origin', () => {
      expect(originMatches('http://127.0.0.1:5173', 'http://127.0.0.1:5173')).toBe(true);
    });

    it('rejects a missing Origin header', () => {
      expect(originMatches(undefined, 'http://127.0.0.1:5173')).toBe(false);
    });

    it('rejects an obviously wrong origin', () => {
      expect(originMatches('http://example.com', 'http://127.0.0.1:5173')).toBe(false);
    });

    it('rejects a lookalike/subdomain origin, not just a missing or obviously-wrong one (KTD9)', () => {
      expect(originMatches('http://127.0.0.1.evil.com', 'http://127.0.0.1')).toBe(false);
      expect(originMatches('http://127.0.0.1:5173.evil.com', 'http://127.0.0.1:5173')).toBe(false);
    });

    it('rejects a same-host-different-port origin (no suffix/prefix leniency)', () => {
      expect(originMatches('http://127.0.0.1:9999', 'http://127.0.0.1:5173')).toBe(false);
    });
  });

  describe('extractSessionToken', () => {
    it('reads the token from the header', () => {
      const req = fakeRequest({ [SESSION_TOKEN_HEADER]: 'tok-123' });
      expect(extractSessionToken(req)).toBe('tok-123');
    });

    it('falls back to a body field when the header is absent', () => {
      const req = fakeRequest({});
      expect(extractSessionToken(req, { sessionToken: 'tok-from-body' })).toBe('tok-from-body');
    });

    it('prefers the header over the body when both are present', () => {
      const req = fakeRequest({ [SESSION_TOKEN_HEADER]: 'header-tok' });
      expect(extractSessionToken(req, { sessionToken: 'body-tok' })).toBe('header-tok');
    });

    it('returns undefined when neither the header nor the body carries a token', () => {
      const req = fakeRequest({});
      expect(extractSessionToken(req)).toBeUndefined();
    });

    it('never reads req.headers.cookie for the token (KTD9: not an automatically-sent cookie)', () => {
      const req = fakeRequest({ cookie: 'companionToken=should-be-ignored' });
      expect(extractSessionToken(req)).toBeUndefined();
    });
  });

  describe('tokenMatches', () => {
    it('accepts the expected token', () => {
      expect(tokenMatches('abc', 'abc')).toBe(true);
    });

    it('rejects a wrong or undefined token', () => {
      expect(tokenMatches('wrong', 'abc')).toBe(false);
      expect(tokenMatches(undefined, 'abc')).toBe(false);
    });
  });
});
