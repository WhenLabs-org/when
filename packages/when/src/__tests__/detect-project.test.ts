import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import {
  detectProjectName,
  detectProjectDirName,
  detectProjectStack,
  detectProjectWithStack,
  readAwareProjectName,
} from '../utils/detect-project.js';

const mockExec = vi.mocked(execSync);

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'detect-project-test-'));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectProjectName', () => {
  it('returns repo name from https git remote', () => {
    mockExec.mockReturnValueOnce('https://github.com/WhenLabs-org/when.git\n' as unknown as Buffer);
    expect(detectProjectName(tmpDir)).toBe('when');
  });

  it('returns repo name from ssh git remote (colon-separated)', () => {
    mockExec.mockReturnValueOnce('git@github.com:foo/my-tool.git\n' as unknown as Buffer);
    expect(detectProjectName(tmpDir)).toBe('my-tool');
  });

  it('handles git remote without .git suffix', () => {
    mockExec.mockReturnValueOnce('https://github.com/a/bare-name\n' as unknown as Buffer);
    expect(detectProjectName(tmpDir)).toBe('bare-name');
  });

  it('falls back to basename when git has no remote', () => {
    mockExec.mockImplementationOnce(() => {
      throw new Error('not a git repo');
    });
    const childDir = join(tmpDir, 'my-project');
    mkdirSync(childDir);
    expect(detectProjectName(childDir)).toBe('my-project');
  });

  it('falls back to basename when git returns empty', () => {
    mockExec.mockReturnValueOnce('' as unknown as Buffer);
    const childDir = join(tmpDir, 'empty-remote');
    mkdirSync(childDir);
    expect(detectProjectName(childDir)).toBe('empty-remote');
  });
});

describe('detectProjectDirName', () => {
  it('returns basename of provided path', () => {
    expect(detectProjectDirName('/tmp/foo/bar')).toBe('bar');
  });

  it('normalizes windows-style separators', () => {
    expect(detectProjectDirName('C:\\Users\\x\\projects\\baz')).toBe('baz');
  });

  it('returns "unknown" for empty path', () => {
    expect(detectProjectDirName('')).not.toBe('');
  });
});

describe('detectProjectStack', () => {
  it('detects node from package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}');
    expect(detectProjectStack(tmpDir)).toBe('node');
  });

  it('reports multiple stacks joined by comma', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}');
    writeFileSync(join(tmpDir, 'go.mod'), 'module x\n');
    const stack = detectProjectStack(tmpDir);
    expect(stack).toContain('node');
    expect(stack).toContain('go');
  });

  it('returns unknown when no manifests present', () => {
    expect(detectProjectStack(tmpDir)).toBe('unknown');
  });

  it('deduplicates stacks (python has two manifest files)', () => {
    writeFileSync(join(tmpDir, 'pyproject.toml'), '');
    writeFileSync(join(tmpDir, 'requirements.txt'), '');
    expect(detectProjectStack(tmpDir)).toBe('python');
  });
});

describe('detectProjectWithStack', () => {
  it('prefers package.json name over basename', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: '@scope/my-lib' }),
    );
    const info = detectProjectWithStack(tmpDir);
    expect(info.name).toBe('@scope/my-lib');
    expect(info.stack).toBe('node');
  });

  it('falls back to basename when package.json has no name', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}');
    const info = detectProjectWithStack(tmpDir);
    expect(info.name).toBe(tmpDir.split('/').filter(Boolean).pop());
    expect(info.stack).toBe('node');
  });

  it('tolerates malformed package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), 'not json');
    const info = detectProjectWithStack(tmpDir);
    expect(info.name).toBe(tmpDir.split('/').filter(Boolean).pop());
  });
});

describe('readAwareProjectName', () => {
  it('reads name field from .aware.json', () => {
    writeFileSync(join(tmpDir, '.aware.json'), JSON.stringify({ name: 'from-aware' }));
    expect(readAwareProjectName(tmpDir)).toBe('from-aware');
  });

  it('falls back to project field', () => {
    writeFileSync(join(tmpDir, '.aware.json'), JSON.stringify({ project: 'proj-name' }));
    expect(readAwareProjectName(tmpDir)).toBe('proj-name');
  });

  it('returns null when .aware.json is absent', () => {
    expect(readAwareProjectName(tmpDir)).toBeNull();
  });

  it('returns null when .aware.json is malformed', () => {
    writeFileSync(join(tmpDir, '.aware.json'), 'garbage');
    expect(readAwareProjectName(tmpDir)).toBeNull();
  });
});
