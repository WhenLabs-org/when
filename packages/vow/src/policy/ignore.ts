import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const VOWIGNORE_FILE = '.vowignore';

/**
 * Compile a glob-style pattern into a RegExp. Supports only:
 *   `*`  — matches any sequence of chars (including `/`)
 *   `?`  — matches a single char
 *   exact char matches otherwise
 *
 * Everything else is escaped literally. Matching is anchored and
 * case-insensitive, matching npm's package-name conventions.
 */
export function compilePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[\\^$+.()|{}[\]]/g, '\\$&');
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`, 'i');
}

/**
 * Read `.vowignore` from projectPath. Each non-blank, non-comment line is a
 * glob-style pattern matched against package names.
 */
export async function loadIgnoreFile(projectPath: string): Promise<string[]> {
  try {
    const content = await readFile(path.join(projectPath, VOWIGNORE_FILE), 'utf-8');
    return parseIgnoreContent(content);
  } catch {
    return [];
  }
}

export function parseIgnoreContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export function matchesAny(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (compilePattern(pattern).test(name)) return true;
  }
  return false;
}
