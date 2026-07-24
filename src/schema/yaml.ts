import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';

export class YamlLoadError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Failed to parse YAML at ${filePath}: ${(cause as Error).message}`);
    this.name = 'YamlLoadError';
  }
}

export function loadYaml<T>(filePath: string): T {
  const raw = readFileSync(filePath, 'utf-8');
  try {
    const parsed = parse(raw);
    if (parsed === null || parsed === undefined) {
      throw new Error('document is empty');
    }
    return parsed as T;
  } catch (cause) {
    throw new YamlLoadError(filePath, cause);
  }
}

export function parseYaml<T>(raw: string, sourceLabel = '<string>'): T {
  try {
    const parsed = parse(raw);
    if (parsed === null || parsed === undefined) {
      throw new Error('document is empty');
    }
    return parsed as T;
  } catch (cause) {
    throw new YamlLoadError(sourceLabel, cause);
  }
}

export function stringifyYaml(value: unknown): string {
  return stringify(value);
}

export function writeYaml(filePath: string, value: unknown): void {
  writeFileSync(filePath, stringifyYaml(value), 'utf-8');
}
