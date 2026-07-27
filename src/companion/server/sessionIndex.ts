import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCompanionStateDir } from "./authToken.ts";

const INDEX_FILE_NAME = "session-index.json";

export type SessionKey = {
  classId: string;
  date: string;
};

type IndexFile = Record<string, string>;

export function getSessionIndexPath(): string {
  return join(getCompanionStateDir(), INDEX_FILE_NAME);
}

function keyFor({ classId, date }: SessionKey): string {
  return `${classId}::${date}`;
}

/**
 * A corrupted (non-JSON) index file must not crash the caller — treat it as an empty index and
 * warn, the same "start fresh rather than throw" posture the plan asks for on a broken SDK
 * transcript. A missing file is the normal first-run state, not corruption: no warning.
 */
function readIndexFile(): IndexFile {
  const path = getSessionIndexPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as IndexFile;
    }
    console.warn(
      `[companion] Session index at ${path} was not a JSON object; starting a fresh index.`,
    );
    return {};
  } catch (err) {
    console.warn(
      `[companion] Session index at ${path} is corrupted; starting a fresh index. (${(err as Error).message})`,
    );
    return {};
  }
}

function writeIndexFile(index: IndexFile): void {
  const path = getSessionIndexPath();
  mkdirSync(getCompanionStateDir(), { recursive: true });
  // Write-then-rename so a crash mid-write never leaves a half-written/corrupted index file.
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(index, null, 2));
  renameSync(tmpPath, path);
}

/**
 * All reads/writes of the index file are single-process (KTD1), but two overlapping requests
 * (e.g. two browser tabs) can still race on the read-modify-write cycle. This module-level queue
 * serializes every write against the one shared file, which trivially also serializes same-key
 * writes — no silent last-write-wins corruption is possible.
 */
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite<T>(task: () => T): Promise<T> {
  const result = writeQueue.then(task);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function getSessionId(
  key: SessionKey,
): Promise<string | undefined> {
  return enqueueWrite(() => readIndexFile()[keyFor(key)]);
}

export async function setSessionId(
  params: SessionKey & { sessionId: string },
): Promise<void> {
  const { classId, date, sessionId } = params;
  await enqueueWrite(() => {
    const index = readIndexFile();
    index[keyFor({ classId, date })] = sessionId;
    writeIndexFile(index);
  });
}
