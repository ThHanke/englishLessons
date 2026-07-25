import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCompanionStateDir, getTokenFilePath, loadAuthToken, writeAuthToken } from './authToken.ts';

const ORIGINAL_ENV = { ...process.env };

function isolateConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'companion-config-'));
  process.env.XDG_CONFIG_HOME = dir;
  return dir;
}

describe('authToken', () => {
  let tmpDirs: string[] = [];

  beforeEach(() => {
    tmpDirs = [];
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.XDG_CONFIG_HOME;
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

  describe('getCompanionStateDir', () => {
    it('resolves to a path outside the repo cwd', () => {
      const dir = isolateConfigDir();
      tmpDirs.push(dir);
      const stateDir = getCompanionStateDir();
      const tokenPath = getTokenFilePath();
      expect(stateDir.startsWith(process.cwd())).toBe(false);
      expect(tokenPath.startsWith(process.cwd())).toBe(false);
    });
  });

  describe('loadAuthToken', () => {
    it('fails startup with a clear message when the token file is missing', () => {
      const dir = isolateConfigDir();
      tmpDirs.push(dir);
      expect(() => loadAuthToken()).toThrow(/claude setup-token/i);
    });

    it('sets CLAUDE_CODE_OAUTH_TOKEN from the token file contents on success', () => {
      const dir = isolateConfigDir();
      tmpDirs.push(dir);
      writeAuthToken('my-oauth-token-value');

      loadAuthToken();

      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('my-oauth-token-value');
    });

    it('fails startup with a clear message when the token file is empty', () => {
      const dir = isolateConfigDir();
      tmpDirs.push(dir);
      writeAuthToken('   \n');

      expect(() => loadAuthToken()).toThrow(/empty/i);
    });

    it('warns when ANTHROPIC_API_KEY is present in the environment at startup', () => {
      const dir = isolateConfigDir();
      tmpDirs.push(dir);
      writeAuthToken('token-value');
      process.env.ANTHROPIC_API_KEY = 'sk-something';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      loadAuthToken();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/ANTHROPIC_API_KEY/));
    });

    it('does not warn about ANTHROPIC_API_KEY when it is absent', () => {
      const dir = isolateConfigDir();
      tmpDirs.push(dir);
      writeAuthToken('token-value');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      loadAuthToken();

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/ANTHROPIC_API_KEY/));
    });

    it.skipIf(process.platform === 'win32')(
      'warns at startup when the token file permissions are broader than owner-only',
      () => {
        const dir = isolateConfigDir();
        tmpDirs.push(dir);
        writeAuthToken('token-value');
        chmodSync(getTokenFilePath(), 0o644);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        loadAuthToken();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/permission/i));
      },
    );

    it.skipIf(process.platform === 'win32')('does not warn about permissions when the file is already owner-only', () => {
      const dir = isolateConfigDir();
      tmpDirs.push(dir);
      writeAuthToken('token-value');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      loadAuthToken();

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/permission/i));
    });
  });

  describe('writeAuthToken', () => {
    it.skipIf(process.platform === 'win32')('sets the token file mode to owner-only (0600)', () => {
      const dir = isolateConfigDir();
      tmpDirs.push(dir);

      writeAuthToken('rotated-token');

      const mode = statSync(getTokenFilePath()).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });
});
