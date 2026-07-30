import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadYaml } from "../../schema/yaml.ts";
import type { CalendarFile } from "../../schema/types.ts";

/**
 * Mirrors `src/cli/validateAll.ts`'s `calendar/*.yaml` walk, then picks the file whose
 * `class_schedule` covers `className`. Fallback when this matches more than one calendar file:
 * first match wins, in `readdirSync` order - no further ambiguity resolution is implemented,
 * since today's repo only ever has one calendar file per school year and this hasn't come up.
 *
 * Single source of truth for this lookup -- `dateContext.ts`, `moduleTasks.ts`, and the ICS
 * generator (`src/publish/generateIcs.ts`) all import this instead of keeping their own copy, so
 * the "which calendar file covers this class" answer can't drift between them.
 */
export function loadCalendarForClass(
  className: string,
  repoRoot: string,
): CalendarFile | null {
  const calendarDir = join(repoRoot, "calendar");
  const files = readdirSync(calendarDir).filter((f) => f.endsWith(".yaml"));
  for (const file of files) {
    const calendar = loadYaml<CalendarFile>(join(calendarDir, file));
    if (calendar.class_schedule[className]) {
      return calendar;
    }
  }
  return null;
}
