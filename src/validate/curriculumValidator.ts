import { MODE_VALUES, USED_IN_VALUES } from '../schema/types.ts';
import type { GradeBand } from '../schema/types.ts';

export interface Issue {
  severity: 'error' | 'deferred';
  code: string;
  message: string;
  file: string;
  id?: string;
}

interface CheckableEntry {
  collection: string;
  id?: unknown;
  source?: unknown;
  used_in?: unknown;
  mode?: unknown;
  hasMode: boolean;
}

function collectBandEntries(band: GradeBand): CheckableEntry[] {
  const fk = band.competence_areas.funktional_kommunikativ;
  const ik = band.competence_areas.interkulturell;
  const entries: CheckableEntry[] = [];

  const push = (collection: string, list: unknown[], hasMode: boolean) => {
    for (const raw of list) {
      const e = raw as Record<string, unknown>;
      entries.push({ collection, id: e.id, source: e.source, used_in: e.used_in, mode: e.mode, hasMode });
    }
  };

  push('funktional_kommunikativ.kommunikativ', fk.kommunikativ, true);
  push('funktional_kommunikativ.sprachliche_mittel.grammatik', fk.sprachliche_mittel.grammatik, true);
  push('funktional_kommunikativ.sprachliche_mittel.wortschatz', fk.sprachliche_mittel.wortschatz, true);
  push('funktional_kommunikativ.sprachliche_mittel.aussprache', fk.sprachliche_mittel.aussprache, true);
  push('funktional_kommunikativ.sprachliche_mittel.orthografie', fk.sprachliche_mittel.orthografie, true);
  push('interkulturell.anforderungen', ik.anforderungen, true);
  push('interkulturell.orientierungswissen', ik.orientierungswissen, false);
  push('methodisch', band.competence_areas.methodisch, false);
  push('content_fields', band.content_fields, false);

  return entries;
}

/** Every entry id defined anywhere in the band (used by the referential validator). */
export function collectBandEntryIds(band: GradeBand): Set<string> {
  return new Set(
    collectBandEntries(band)
      .map((e) => e.id)
      .filter((id): id is string => typeof id === 'string'),
  );
}

export function validateGradeBand(band: GradeBand, filePath: string): Issue[] {
  const issues: Issue[] = [];
  const seenIds = new Map<string, number>();

  for (const entry of collectBandEntries(band)) {
    const id = typeof entry.id === 'string' ? entry.id : undefined;

    if (!id) {
      issues.push({
        severity: 'error',
        code: 'missing_id',
        message: `Entry in ${entry.collection} is missing an id`,
        file: filePath,
      });
    } else {
      seenIds.set(id, (seenIds.get(id) ?? 0) + 1);
    }

    const source = entry.source as { doc?: unknown; location?: unknown } | undefined;
    if (!source || typeof source.doc !== 'string' || !source.doc || typeof source.location !== 'string' || !source.location) {
      issues.push({
        severity: 'error',
        code: 'missing_source',
        message: `Entry ${id ?? '<no id>'} in ${entry.collection} is missing source.doc/source.location`,
        file: filePath,
        id,
      });
    }

    const usedIn = entry.used_in;
    if (!Array.isArray(usedIn) || usedIn.length === 0) {
      issues.push({
        severity: 'error',
        code: 'missing_used_in',
        message: `Entry ${id ?? '<no id>'} in ${entry.collection} has no used_in tags`,
        file: filePath,
        id,
      });
    } else {
      for (const tag of usedIn) {
        if (!USED_IN_VALUES.includes(tag)) {
          issues.push({
            severity: 'error',
            code: 'invalid_used_in',
            message: `Entry ${id ?? '<no id>'} in ${entry.collection} has invalid used_in value "${tag}"`,
            file: filePath,
            id,
          });
        }
      }
    }

    if (entry.hasMode) {
      const mode = entry.mode;
      if (!Array.isArray(mode) || mode.length === 0) {
        issues.push({
          severity: 'error',
          code: 'missing_mode',
          message: `Entry ${id ?? '<no id>'} in ${entry.collection} has no mode`,
          file: filePath,
          id,
        });
      } else {
        for (const m of mode) {
          if (!MODE_VALUES.includes(m)) {
            issues.push({
              severity: 'error',
              code: 'invalid_mode',
              message: `Entry ${id ?? '<no id>'} in ${entry.collection} has invalid mode value "${m}"`,
              file: filePath,
              id,
            });
          }
        }
      }
    }
  }

  for (const [id, count] of seenIds) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'duplicate_id',
        message: `Id "${id}" appears ${count} times in the band`,
        file: filePath,
        id,
      });
    }
  }

  return issues;
}
