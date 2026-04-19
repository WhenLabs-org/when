import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConfigCommand } from '../commands/config.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'when-config-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: run a command action by setting process.cwd() to tmpDir
function withCwd<T>(dir: string, fn: () => T): T {
  const original = process.cwd;
  process.cwd = () => dir;
  try {
    return fn();
  } finally {
    process.cwd = original;
  }
}

describe('createConfigCommand', () => {
  it('returns a Command named config', () => {
    const cmd = createConfigCommand();
    expect(cmd.name()).toBe('config');
  });

  it('has init and validate subcommands', () => {
    const cmd = createConfigCommand();
    const names = cmd.commands.map((c) => c.name());
    expect(names).toContain('init');
    expect(names).toContain('validate');
  });
});

describe('when config init', () => {
  it('generates .whenlabs.yml when it does not exist', async () => {
    const configPath = join(tmpDir, '.whenlabs.yml');
    expect(existsSync(configPath)).toBe(false);

    const cmd = createConfigCommand();
    const initCmd = cmd.commands.find((c) => c.name() === 'init')!;

    await withCwd(tmpDir, () => initCmd.parseAsync(['node', 'when', 'config', 'init']));

    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('stale');
    expect(content).toContain('vow');
    expect(content).toContain('berth');
    expect(content).toContain('aware');
    expect(content).toContain('velocity');
  });

  it('does not overwrite existing config without --force', async () => {
    const configPath = join(tmpDir, '.whenlabs.yml');
    writeFileSync(configPath, 'stale:\n  ignore: []\n', 'utf-8');

    const cmd = createConfigCommand();
    const initCmd = cmd.commands.find((c) => c.name() === 'init')!;

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await withCwd(tmpDir, () => initCmd.parseAsync(['node', 'when', 'config', 'init']));
    } finally {
      console.log = orig;
    }

    // File should be unchanged
    expect(readFileSync(configPath, 'utf-8')).toBe('stale:\n  ignore: []\n');
    expect(logs.some((l) => l.includes('already exists'))).toBe(true);
  });

  it('overwrites existing config with --force', async () => {
    const configPath = join(tmpDir, '.whenlabs.yml');
    writeFileSync(configPath, 'old: true\n', 'utf-8');

    const cmd = createConfigCommand();
    const initCmd = cmd.commands.find((c) => c.name() === 'init')!;

    await withCwd(tmpDir, () => initCmd.parseAsync(['node', 'when', 'config', 'init', '--force']));

    const content = readFileSync(configPath, 'utf-8');
    expect(content).not.toBe('old: true\n');
    expect(content).toContain('stale');
  });

  it('incorporates existing .stale.yml into generated config', async () => {
    writeFileSync(join(tmpDir, '.stale.yml'), 'ignore:\n  - docs/\ndeep: true\n', 'utf-8');

    const cmd = createConfigCommand();
    const initCmd = cmd.commands.find((c) => c.name() === 'init')!;

    await withCwd(tmpDir, () => initCmd.parseAsync(['node', 'when', 'config', 'init']));

    const content = readFileSync(join(tmpDir, '.whenlabs.yml'), 'utf-8');
    expect(content).toContain('docs/');
    expect(content).toContain('deep: true');
  });

  it('incorporates existing .vow.json into generated config', async () => {
    writeFileSync(
      join(tmpDir, '.vow.json'),
      JSON.stringify({ policy: 'opensource', production_only: true }),
      'utf-8',
    );

    const cmd = createConfigCommand();
    const initCmd = cmd.commands.find((c) => c.name() === 'init')!;

    await withCwd(tmpDir, () => initCmd.parseAsync(['node', 'when', 'config', 'init']));

    const content = readFileSync(join(tmpDir, '.whenlabs.yml'), 'utf-8');
    expect(content).toContain('opensource');
    expect(content).toContain('production_only: true');
  });

  it('incorporates existing .env.schema path into generated config', async () => {
    writeFileSync(join(tmpDir, '.env.schema'), 'PORT=number\n', 'utf-8');

    const cmd = createConfigCommand();
    const initCmd = cmd.commands.find((c) => c.name() === 'init')!;

    await withCwd(tmpDir, () => initCmd.parseAsync(['node', 'when', 'config', 'init']));

    const content = readFileSync(join(tmpDir, '.whenlabs.yml'), 'utf-8');
    expect(content).toContain('.env.schema');
  });
});

describe('when config validate', () => {
  it('reports valid when config is well-formed', async () => {
    const yaml = 'stale:\n  ignore:\n    - docs/\nvow:\n  production_only: true\nberth: {}\naware: {}\nvelocity: {}\n';
    writeFileSync(join(tmpDir, '.whenlabs.yml'), yaml, 'utf-8');

    const cmd = createConfigCommand();
    const validateCmd = cmd.commands.find((c) => c.name() === 'validate')!;

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await withCwd(tmpDir, () => validateCmd.parseAsync(['node', 'when', 'config', 'validate']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('valid'))).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });

  it('reports error for invalid stale.deep type', async () => {
    writeFileSync(
      join(tmpDir, '.whenlabs.yml'),
      'stale:\n  deep: "yes"\n',
      'utf-8',
    );

    const cmd = createConfigCommand();
    const validateCmd = cmd.commands.find((c) => c.name() === 'validate')!;

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    const origExitCode = process.exitCode;
    try {
      await withCwd(tmpDir, () => validateCmd.parseAsync(['node', 'when', 'config', 'validate']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('stale.deep'))).toBe(true);
    process.exitCode = origExitCode;
  });

  it('handles missing .whenlabs.yml gracefully', async () => {
    const cmd = createConfigCommand();
    const validateCmd = cmd.commands.find((c) => c.name() === 'validate')!;

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await withCwd(tmpDir, () => validateCmd.parseAsync(['node', 'when', 'config', 'validate']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('nothing to validate') || l.includes('No'))).toBe(true);
  });
});
