import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { injectBlock, removeBlock, hasBlock } from '../utils/claude-md.js';

const START = '<!-- whenlabs:start -->';
const END = '<!-- whenlabs:end -->';

let tmpDir: string;
let tmpFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'when-test-'));
  tmpFile = join(tmpDir, 'CLAUDE.md');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('hasBlock', () => {
  it('returns false when file does not exist', () => {
    expect(hasBlock(tmpFile)).toBe(false);
  });

  it('returns false when file has no markers', () => {
    writeFileSync(tmpFile, '# Hello\n', 'utf-8');
    expect(hasBlock(tmpFile)).toBe(false);
  });

  it('returns true when both markers are present', () => {
    writeFileSync(tmpFile, `${START}\nsome content\n${END}\n`, 'utf-8');
    expect(hasBlock(tmpFile)).toBe(true);
  });
});

describe('injectBlock', () => {
  it('creates the file if it does not exist', () => {
    injectBlock(tmpFile, 'new content');
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).toContain(START);
    expect(result).toContain('new content');
    expect(result).toContain(END);
  });

  it('creates parent directories if they do not exist', () => {
    const nested = join(tmpDir, 'a', 'b', 'CLAUDE.md');
    injectBlock(nested, 'nested content');
    const result = readFileSync(nested, 'utf-8');
    expect(result).toContain('nested content');
  });

  it('appends block when file has no markers', () => {
    writeFileSync(tmpFile, '# Existing content\n', 'utf-8');
    injectBlock(tmpFile, 'injected');
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).toContain('# Existing content');
    expect(result).toContain(START);
    expect(result).toContain('injected');
    expect(result).toContain(END);
  });

  it('replaces existing block when markers are present', () => {
    writeFileSync(tmpFile, `# Top\n\n${START}\nold content\n${END}\n`, 'utf-8');
    injectBlock(tmpFile, 'new content');
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).not.toContain('old content');
    expect(result).toContain('new content');
    expect(result).toContain('# Top');
  });

  it('does not duplicate markers on repeated inject', () => {
    injectBlock(tmpFile, 'first');
    injectBlock(tmpFile, 'second');
    const result = readFileSync(tmpFile, 'utf-8');
    const startCount = (result.match(new RegExp(START, 'g')) ?? []).length;
    expect(startCount).toBe(1);
    expect(result).toContain('second');
    expect(result).not.toContain('first');
  });
});

describe('removeBlock', () => {
  it('does nothing when file does not exist', () => {
    expect(() => removeBlock(tmpFile)).not.toThrow();
  });

  it('removes the marker block from the file', () => {
    writeFileSync(tmpFile, `# Header\n\n${START}\nsome content\n${END}\n`, 'utf-8');
    removeBlock(tmpFile);
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).not.toContain(START);
    expect(result).not.toContain(END);
    expect(result).not.toContain('some content');
    expect(result).toContain('# Header');
  });

  it('cleans up extra blank lines after removal', () => {
    writeFileSync(tmpFile, `# Header\n\n\n${START}\ncontent\n${END}\n\n\n# Footer\n`, 'utf-8');
    removeBlock(tmpFile);
    const result = readFileSync(tmpFile, 'utf-8');
    // Should not have more than 2 consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('handles file with only the marker block', () => {
    writeFileSync(tmpFile, `${START}\nonly content\n${END}\n`, 'utf-8');
    removeBlock(tmpFile);
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).not.toContain('only content');
  });
});
