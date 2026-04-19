import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const START_MARKER = '<!-- whenlabs:start -->';
const END_MARKER = '<!-- whenlabs:end -->';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hasBlock(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  return content.includes(START_MARKER) && content.includes(END_MARKER);
}

export function injectBlock(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const block = `${START_MARKER}\n${content}\n${END_MARKER}`;

  if (!existsSync(filePath)) {
    writeFileSync(filePath, block + '\n', 'utf-8');
    return;
  }

  let existing = readFileSync(filePath, 'utf-8');

  if (existing.includes(START_MARKER) && existing.includes(END_MARKER)) {
    const pattern = new RegExp(
      `${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}`,
      'g',
    );
    existing = existing.replace(pattern, block);
    writeFileSync(filePath, existing, 'utf-8');
  } else {
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(filePath, existing + separator + block + '\n', 'utf-8');
  }
}

export function removeBlock(filePath: string): void {
  if (!existsSync(filePath)) return;

  let content = readFileSync(filePath, 'utf-8');

  const pattern = new RegExp(
    `\\n?${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}\\n?`,
    'g',
  );
  content = content.replace(pattern, '\n');

  // Clean up multiple consecutive blank lines
  content = content.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

  writeFileSync(filePath, content, 'utf-8');
}
