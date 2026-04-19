import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEjectCommand } from '../commands/eject.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'when-eject-test-'));
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function withCwd<T>(dir: string, fn: () => T): T {
  const original = process.cwd;
  process.cwd = () => dir;
  try {
    return fn();
  } finally {
    process.cwd = original;
  }
}

function writeWhenlabsYml(dir: string, content: string): void {
  writeFileSync(join(dir, '.whenlabs.yml'), content, 'utf-8');
}

describe('createEjectCommand', () => {
  it('returns a Command named eject', () => {
    const cmd = createEjectCommand();
    expect(cmd.name()).toBe('eject');
  });

  it('has a --force option', () => {
    const cmd = createEjectCommand();
    const opt = cmd.options.find((o) => o.long === '--force');
    expect(opt).toBeDefined();
  });
});

describe('when eject — no config file', () => {
  it('prints a warning when .whenlabs.yml is absent', async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createEjectCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('nothing to eject') || l.includes('No'))).toBe(true);
  });
});

describe('when eject — stale section', () => {
  it('writes .stale.yml from config', async () => {
    writeWhenlabsYml(tmpDir, 'stale:\n  ignore:\n    - docs/\n  deep: true\n');

    const cmd = createEjectCommand();
    await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));

    const dest = join(tmpDir, '.stale.yml');
    expect(existsSync(dest)).toBe(true);
    const content = readFileSync(dest, 'utf-8');
    expect(content).toContain('docs/');
    expect(content).toContain('deep: true');
  });

  it('skips empty stale section', async () => {
    writeWhenlabsYml(tmpDir, 'stale: {}\n');

    const cmd = createEjectCommand();
    await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));

    expect(existsSync(join(tmpDir, '.stale.yml'))).toBe(false);
  });

  it('warns when .stale.yml already exists without --force', async () => {
    writeWhenlabsYml(tmpDir, 'stale:\n  ignore:\n    - build/\n');
    writeFileSync(join(tmpDir, '.stale.yml'), 'existing: true\n', 'utf-8');

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createEjectCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));
    } finally {
      console.log = orig;
    }

    // File unchanged
    expect(readFileSync(join(tmpDir, '.stale.yml'), 'utf-8')).toBe('existing: true\n');
    expect(logs.some((l) => l.includes('already exists'))).toBe(true);
  });

  it('overwrites .stale.yml with --force', async () => {
    writeWhenlabsYml(tmpDir, 'stale:\n  ignore:\n    - build/\n');
    writeFileSync(join(tmpDir, '.stale.yml'), 'existing: true\n', 'utf-8');

    const cmd = createEjectCommand();
    await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject', '--force']));

    const content = readFileSync(join(tmpDir, '.stale.yml'), 'utf-8');
    expect(content).not.toBe('existing: true\n');
    expect(content).toContain('build/');
  });
});

describe('when eject — vow section', () => {
  it('writes .vow.json from config', async () => {
    writeWhenlabsYml(tmpDir, 'vow:\n  policy: opensource\n  production_only: true\n');

    const cmd = createEjectCommand();
    await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));

    const dest = join(tmpDir, '.vow.json');
    expect(existsSync(dest)).toBe(true);
    const parsed = JSON.parse(readFileSync(dest, 'utf-8'));
    expect(parsed.policy).toBe('opensource');
    expect(parsed.production_only).toBe(true);
  });

  it('skips empty vow section', async () => {
    writeWhenlabsYml(tmpDir, 'vow: {}\n');

    const cmd = createEjectCommand();
    await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));

    expect(existsSync(join(tmpDir, '.vow.json'))).toBe(false);
  });

  it('warns when .vow.json already exists without --force', async () => {
    writeWhenlabsYml(tmpDir, 'vow:\n  policy: commercial\n');
    writeFileSync(join(tmpDir, '.vow.json'), '{"existing":true}', 'utf-8');

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createEjectCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));
    } finally {
      console.log = orig;
    }

    expect(readFileSync(join(tmpDir, '.vow.json'), 'utf-8')).toBe('{"existing":true}');
    expect(logs.some((l) => l.includes('already exists'))).toBe(true);
  });
});

describe('when eject — envalid section', () => {
  it('copies schema file to .env.schema', async () => {
    const schemaContent = 'PORT=number\nDATABASE_URL=string\n';
    writeFileSync(join(tmpDir, 'my.schema'), schemaContent, 'utf-8');
    writeWhenlabsYml(tmpDir, 'envalid:\n  schema: my.schema\n');

    const cmd = createEjectCommand();
    await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));

    const dest = join(tmpDir, '.env.schema');
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, 'utf-8')).toBe(schemaContent);
  });

  it('notes when schema path already is .env.schema', async () => {
    writeFileSync(join(tmpDir, '.env.schema'), 'PORT=number\n', 'utf-8');
    writeWhenlabsYml(tmpDir, 'envalid:\n  schema: .env.schema\n');

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createEjectCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('already points to'))).toBe(true);
  });
});

describe('when eject — berth section', () => {
  it('prints a note about berth having no standalone config', async () => {
    writeWhenlabsYml(tmpDir, 'berth:\n  ports:\n    web: 3000\n    api: 4000\n');

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createEjectCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('berth') && (l.includes('no standalone') || l.includes('standalone config')))).toBe(true);
  });
});

describe('when eject — summary', () => {
  it('reports ejected file count', async () => {
    writeWhenlabsYml(tmpDir, 'stale:\n  deep: true\nvow:\n  policy: opensource\n');

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createEjectCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'eject']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('Ejected') && l.includes('2'))).toBe(true);
  });
});
