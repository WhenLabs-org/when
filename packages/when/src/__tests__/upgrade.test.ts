import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock child_process before importing the command
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs so we control what package.json returns
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  };
});

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createUpgradeCommand } from '../commands/upgrade.js';

const mockExecSync = vi.mocked(execSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

function fakePackageJson(version: string): string {
  return JSON.stringify({ name: '@whenlabs/when', version });
}

describe('createUpgradeCommand', () => {
  it('returns a Command named upgrade', () => {
    const cmd = createUpgradeCommand();
    expect(cmd.name()).toBe('upgrade');
  });
});

describe('when upgrade — up to date', () => {
  it('prints "Already up to date" when current equals latest', async () => {
    mockReadFileSync.mockReturnValueOnce(fakePackageJson('0.10.0') as unknown as Buffer);
    mockExecSync.mockReturnValueOnce('0.10.0\n' as unknown as Buffer);

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createUpgradeCommand();
      await cmd.parseAsync(['node', 'when', 'upgrade']);
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('Already up to date'))).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith('npm view @whenlabs/when version', { encoding: 'utf-8' });
  });

  it('prints "Already up to date" when current is newer than latest', async () => {
    mockReadFileSync.mockReturnValueOnce(fakePackageJson('0.11.0') as unknown as Buffer);
    mockExecSync.mockReturnValueOnce('0.10.0\n' as unknown as Buffer);

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createUpgradeCommand();
      await cmd.parseAsync(['node', 'when', 'upgrade']);
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('Already up to date'))).toBe(true);
  });
});

describe('when upgrade — outdated', () => {
  it('shows current vs latest and runs npm install', async () => {
    mockReadFileSync.mockReturnValueOnce(fakePackageJson('0.9.0') as unknown as Buffer);
    // First call: npm view; second call: npm install
    mockExecSync
      .mockReturnValueOnce('0.10.0\n' as unknown as Buffer)
      .mockReturnValueOnce(undefined as unknown as Buffer);

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createUpgradeCommand();
      await cmd.parseAsync(['node', 'when', 'upgrade']);
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('0.9.0'))).toBe(true);
    expect(logs.some((l) => l.includes('0.10.0'))).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      'npm install -g @whenlabs/when@latest',
      { stdio: 'inherit' },
    );
    expect(logs.some((l) => l.includes('Upgraded to'))).toBe(true);
  });

  it('sets exitCode to 1 if npm install throws', async () => {
    mockReadFileSync.mockReturnValueOnce(fakePackageJson('0.9.0') as unknown as Buffer);
    mockExecSync
      .mockReturnValueOnce('0.10.0\n' as unknown as Buffer)
      .mockImplementationOnce(() => { throw new Error('EPERM'); });

    const orig = console.log;
    console.log = () => {};
    try {
      const cmd = createUpgradeCommand();
      await cmd.parseAsync(['node', 'when', 'upgrade']);
    } finally {
      console.log = orig;
    }

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});

describe('when upgrade — npm unreachable', () => {
  it('sets exitCode to 1 if npm view throws', async () => {
    mockReadFileSync.mockReturnValueOnce(fakePackageJson('0.10.0') as unknown as Buffer);
    mockExecSync.mockImplementationOnce(() => { throw new Error('network error'); });

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createUpgradeCommand();
      await cmd.parseAsync(['node', 'when', 'upgrade']);
    } finally {
      console.log = orig;
    }

    expect(process.exitCode).toBe(1);
    expect(logs.some((l) => l.includes('npm registry') || l.includes('network'))).toBe(true);
    process.exitCode = undefined;
  });
});
