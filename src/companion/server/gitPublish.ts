import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

/** Only these two directories are ever staged (KTD: explicit user scope decision) -- a blanket
 * `git add -A`/`.` would sweep in whatever unrelated source edit happens to be sitting in the
 * same working copy when a teacher clicks Publish. These are the only two dirs the companion
 * server itself ever writes to (artifacts/ via the planning-chat agent's MCP tool, calendar/ via
 * the lesson-series routes). */
const PUBLISHABLE_PATHS = ["artifacts/", "calendar/"];

async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFile("git", args, { cwd: repoRoot });
  return stdout;
}

export interface GitStatusSummary {
  branch: string;
  changedFiles: string[];
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

/** Read-only -- no session-token gate needed at the route level (same tier as `/api/tasks`). */
export async function gitStatusSummary(repoRoot: string): Promise<GitStatusSummary> {
  const branch = (await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();

  const statusOut = await git(repoRoot, ["status", "--porcelain", "--", ...PUBLISHABLE_PATHS]);
  const changedFiles = statusOut
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // porcelain lines are `XY path` (or `XY orig -> path` for renames) -- the path starts after
    // the two-char status code and a space.
    .map((line) => line.slice(3));

  let ahead = 0;
  let behind = 0;
  let hasUpstream = true;
  try {
    const counts = await git(repoRoot, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
    const [a, b] = counts.trim().split(/\s+/).map(Number);
    ahead = a ?? 0;
    behind = b ?? 0;
  } catch {
    // No upstream configured -- a valid, common state, not an error.
    hasUpstream = false;
  }

  return { branch, changedFiles, ahead, behind, hasUpstream };
}

export type PublishResult =
  | { status: "nothing-to-commit" }
  | { status: "published"; commitSha: string }
  | { status: "commit-failed"; error: string }
  | { status: "push-failed"; commitSha: string; error: string };

/** Session-token gated at the route level (a write + push action). Never passes `--author` or
 * appends a Co-Authored-By trailer -- `git commit` uses whatever `user.name`/`user.email` is
 * already configured on the machine, i.e. the teacher's own identity, not the LLM's. */
export async function publishChanges(params: {
  repoRoot: string;
  message: string;
}): Promise<PublishResult> {
  const { repoRoot, message } = params;

  // --ignore-errors: a pathspec that doesn't exist on disk (e.g. calendar/ before it's ever been
  // created) would otherwise fail the whole `add` outright instead of just adding whichever of
  // the two publishable dirs does exist.
  await git(repoRoot, ["add", "--ignore-errors", "--", ...PUBLISHABLE_PATHS]);

  try {
    await git(repoRoot, ["diff", "--cached", "--quiet"]);
    // Exit code 0 -- nothing staged.
    return { status: "nothing-to-commit" };
  } catch {
    // Exit code 1 (staged changes exist) is the expected path through here -- fall through to
    // commit. A real git invocation failure would have already thrown out of the `add` above.
  }

  try {
    await git(repoRoot, ["commit", "-m", message]);
  } catch (err) {
    return { status: "commit-failed", error: commandError(err) };
  }

  const commitSha = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();

  try {
    await git(repoRoot, ["push"]);
  } catch (err) {
    return { status: "push-failed", commitSha, error: commandError(err) };
  }

  return { status: "published", commitSha };
}

/** `execFile`'s rejection carries the real reason on `stderr` (git always writes its error text
 * there, not `message`, which is just "Command failed: git ..."). Falls back to `message` for
 * anything that isn't a `git`-shaped failure. */
function commandError(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  const stderr = e.stderr?.trim();
  return stderr && stderr.length > 0 ? stderr : (e.message ?? String(err));
}
