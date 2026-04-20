import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const CLAUDE_MD_PATH = join(homedir(), '.claude', 'CLAUDE.md');

const START_MARKER = '<!-- whenlabs:start -->';
const END_MARKER = '<!-- whenlabs:end -->';

const LEGACY_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['<!-- velocity-mcp:start -->', '<!-- velocity-mcp:end -->'],
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readIfExists(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function stripBlock(content: string, start: string, end: string): string {
  const pattern = new RegExp(
    `\\n?${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}\\n?`,
    'g',
  );
  return content.replace(pattern, '\n');
}

export function hasBlock(filePath: string): boolean {
  const content = readIfExists(filePath);
  if (content === null) return false;
  return content.includes(START_MARKER) && content.includes(END_MARKER);
}

/**
 * Write the whenlabs block into `filePath`. Any legacy-marker blocks
 * (e.g. velocity-mcp) are stripped in the same pass so CLAUDE.md is
 * read and written once per install.
 */
export function injectBlock(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });

  const block = `${START_MARKER}\n${content}\n${END_MARKER}`;
  let existing = readIfExists(filePath);

  if (existing === null) {
    writeFileSync(filePath, block + '\n', 'utf-8');
    return;
  }

  for (const [s, e] of LEGACY_MARKERS) {
    existing = stripBlock(existing, s, e);
  }

  if (existing.includes(START_MARKER) && existing.includes(END_MARKER)) {
    const pattern = new RegExp(
      `${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}`,
      'g',
    );
    existing = existing.replace(pattern, block);
  } else {
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    existing = existing + separator + block + '\n';
  }

  existing = existing.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  writeFileSync(filePath, existing, 'utf-8');
}

export function removeBlock(filePath: string): void {
  const content = readIfExists(filePath);
  if (content === null) return;

  let updated = stripBlock(content, START_MARKER, END_MARKER);
  for (const [s, e] of LEGACY_MARKERS) {
    updated = stripBlock(updated, s, e);
  }
  updated = updated.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  writeFileSync(filePath, updated, 'utf-8');
}
