import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock execSync to avoid calling real `claude` CLI
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => Buffer.from('')),
}));

// We need to import after mocking
import { injectBlock, removeBlock, hasBlock } from '../utils/claude-md.js';

const OLD_START = '<!-- velocity-mcp:start -->';
const OLD_END = '<!-- velocity-mcp:end -->';
const NEW_START = '<!-- whenlabs:start -->';
const NEW_END = '<!-- whenlabs:end -->';

let tmpDir: string;
let claudeMdPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'when-install-test-'));
  claudeMdPath = join(tmpDir, 'CLAUDE.md');
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('install flow — injectBlock', () => {
  it('writes whenlabs markers into a fresh CLAUDE.md', () => {
    injectBlock(claudeMdPath, 'task timing rules');
    const result = readFileSync(claudeMdPath, 'utf-8');
    expect(result).toContain(NEW_START);
    expect(result).toContain('task timing rules');
    expect(result).toContain(NEW_END);
  });

  it('replaces content on second inject without duplicating markers', () => {
    injectBlock(claudeMdPath, 'original');
    injectBlock(claudeMdPath, 'updated');
    const result = readFileSync(claudeMdPath, 'utf-8');
    expect(result).toContain('updated');
    expect(result).not.toContain('original');
    const startCount = (result.match(new RegExp(NEW_START, 'g')) ?? []).length;
    expect(startCount).toBe(1);
  });
});

describe('uninstall flow — removeBlock', () => {
  it('removes whenlabs markers from CLAUDE.md', () => {
    injectBlock(claudeMdPath, 'some content');
    expect(hasBlock(claudeMdPath)).toBe(true);
    removeBlock(claudeMdPath);
    expect(hasBlock(claudeMdPath)).toBe(false);
  });

  it('preserves content outside the marker block', () => {
    writeFileSync(claudeMdPath, `# My Config\n\n${NEW_START}\nblock\n${NEW_END}\n\n# Footer\n`, 'utf-8');
    removeBlock(claudeMdPath);
    const result = readFileSync(claudeMdPath, 'utf-8');
    expect(result).toContain('# My Config');
    expect(result).toContain('# Footer');
  });
});

describe('migration — old velocity-mcp markers', () => {
  it('old markers can be detected and removed independently', () => {
    // Simulate a file with old standalone velocity-mcp markers
    writeFileSync(
      claudeMdPath,
      `# Config\n\n${OLD_START}\nold velocity config\n${OLD_END}\n`,
      'utf-8',
    );

    const content = readFileSync(claudeMdPath, 'utf-8');
    const hasOld = content.includes(OLD_START) && content.includes(OLD_END);
    expect(hasOld).toBe(true);

    // Simulate the migration: inject new block, then strip old markers
    injectBlock(claudeMdPath, 'new whenlabs content');

    // Strip old markers manually (same logic as install.ts)
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let updated = readFileSync(claudeMdPath, 'utf-8');
    const pattern = new RegExp(
      `\\n?${escape(OLD_START)}[\\s\\S]*?${escape(OLD_END)}\\n?`,
      'g',
    );
    updated = updated.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    writeFileSync(claudeMdPath, updated, 'utf-8');

    const final = readFileSync(claudeMdPath, 'utf-8');
    expect(final).not.toContain(OLD_START);
    expect(final).not.toContain('old velocity config');
    expect(final).toContain(NEW_START);
    expect(final).toContain('new whenlabs content');
  });
});

describe('hasBlock', () => {
  it('returns false when file does not exist', () => {
    expect(hasBlock(join(tmpDir, 'nonexistent.md'))).toBe(false);
  });

  it('returns false when file has no markers', () => {
    writeFileSync(claudeMdPath, '# Empty config\n', 'utf-8');
    expect(hasBlock(claudeMdPath)).toBe(false);
  });

  it('returns true after injectBlock', () => {
    injectBlock(claudeMdPath, 'content');
    expect(hasBlock(claudeMdPath)).toBe(true);
  });
});
