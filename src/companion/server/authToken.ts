import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const APP_DIR_NAME = "english-lessons-companion";
const TOKEN_FILE_NAME = "oauth-token";
const OWNER_ONLY_MODE = 0o600;

/**
 * KTD6: companion state (this token file, plus sessionIndex.ts's index) must live in a
 * *local-only* OS user-config directory, never a roaming/cloud-synced one — a synced folder
 * would exfiltrate the one-year OAuth token off the machine. Linux: XDG_CONFIG_HOME (or
 * ~/.config, which is local by convention). macOS: ~/Library/Application Support, not
 * ~/Library/Mobile Documents (iCloud Drive). Windows: %LOCALAPPDATA%, not the roaming profile.
 */
export function getCompanionStateDir(): string {
  const home = homedir();
  const os = platform();
  if (os === "win32") {
    const base = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return join(base, APP_DIR_NAME);
  }
  if (os === "darwin") {
    return join(home, "Library", "Application Support", APP_DIR_NAME);
  }
  const base = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  return join(base, APP_DIR_NAME);
}

export function getTokenFilePath(): string {
  return join(getCompanionStateDir(), TOKEN_FILE_NAME);
}

/**
 * Reads the `claude setup-token` output from the token file and sets
 * CLAUDE_CODE_OAUTH_TOKEN for this process. Throws (fails startup) if the file is missing or
 * unreadable — there is no sensible degraded mode without auth. An expired token is NOT
 * detectable here: the SDK only surfaces that at query time, via its own error. The caller
 * (agentSession.ts) is responsible for turning that query-time error into a
 * "re-run claude setup-token" message.
 */
export function loadAuthToken(): void {
  warnIfApiKeyPresent();

  const path = getTokenFilePath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read the Claude Code OAuth token at ${path}. Run "claude setup-token" and paste the ` +
        `printed token into that file, then restart the companion. (${(err as Error).message})`,
    );
  }

  warnIfModeTooOpen(path);

  const token = raw.trim();
  if (!token) {
    throw new Error(
      `The Claude Code OAuth token file at ${path} is empty. Run "claude setup-token" and paste the ` +
        `printed token into that file.`,
    );
  }

  process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
}

function warnIfApiKeyPresent(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "[companion] ANTHROPIC_API_KEY is set in the environment. It outranks CLAUDE_CODE_OAUTH_TOKEN in the " +
        "Agent SDK auth precedence, so chat sessions will bill pay-per-token API usage instead of the " +
        "Claude Pro/Max subscription.",
    );
  }
}

function warnIfModeTooOpen(path: string): void {
  if (platform() === "win32") return; // POSIX mode bits don't apply here.
  let mode: number;
  try {
    mode = statSync(path).mode & 0o777;
  } catch {
    return; // stat failing right after a successful read isn't worth failing startup over.
  }
  if (mode & 0o077) {
    console.warn(
      `[companion] Token file ${path} has permissions broader than owner-only (mode ${mode.toString(8)}). ` +
        "This is a best-effort check, not a guarantee across every filesystem. Consider restricting it to 0600.",
    );
  }
}

/**
 * Writes/rotates the token file with owner-only permissions. Not called during normal startup
 * (loadAuthToken only reads); this is the "server itself sets the file mode" half of KTD5, used
 * by whatever setup flow first populates the file.
 */
export function writeAuthToken(token: string): void {
  const dir = getCompanionStateDir();
  mkdirSync(dir, { recursive: true });
  const path = getTokenFilePath();
  writeFileSync(path, token, { mode: OWNER_ONLY_MODE });
  if (platform() !== "win32") {
    chmodSync(path, OWNER_ONLY_MODE);
  }
}
