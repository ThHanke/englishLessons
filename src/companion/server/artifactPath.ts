import { join } from "node:path";

/** `LessonSlot.id` values are either UUIDs (`randomUUID()`, `seriesGeneration.ts`) or short
 * fixture/test strings -- never contain path separators. `slotId` reaches this function from
 * caller-supplied request params (routes/chat.ts, routes/lessonPreview.ts, etc.), so it's
 * validated here, at the one place every consumer's filesystem path gets built from it, rather
 * than trusting each call site to have checked it first. */
const SLOT_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * The one place that decides where a lesson's generated content lives on disk:
 * `artifacts/<classId>/<date>/` for a class that can't have more than one lesson per day, or
 * `artifacts/<classId>/<date>/<slotId>/` when a slot is known (double periods). Shared by every
 * reader/writer of lesson content (`artifactTools.ts`, `dateContext.ts`, `rescheduleLesson.ts`,
 * `routes/artifacts.ts`) so the two shapes never drift apart.
 */
export function artifactDir(
  repoRoot: string,
  classId: string,
  date: string,
  slotId?: string,
): string {
  if (slotId !== undefined && !SLOT_ID_RE.test(slotId)) {
    throw new Error(`Invalid slotId "${slotId}"`);
  }
  return slotId
    ? join(repoRoot, "artifacts", classId, date, slotId)
    : join(repoRoot, "artifacts", classId, date);
}
