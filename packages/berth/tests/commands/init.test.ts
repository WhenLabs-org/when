import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../src/detectors/index.js', () => ({
  detectAllConfigured: vi.fn(async () => ({
    ports: [
      {
        port: 3000,
        source: 'package-json',
        sourceFile: '/tmp/package.json',
        context: 'scripts.dev: next dev',
        projectDir: '/tmp',
        projectName: 'demo',
        confidence: 'high',
      },
      {
        port: 5432,
        source: 'dotenv',
        sourceFile: '/tmp/.env',
        context: 'DB_PORT=5432',
        projectDir: '/tmp',
        projectName: 'demo',
        confidence: 'high',
      },
    ],
    warnings: [],
  })),
}));

import { initCommand } from '../../src/commands/init.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-init-'));
  process.exitCode = undefined;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('initCommand', () => {
  it('creates a berth.config.js with detected ports', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await initCommand({ json: false, verbose: false, noColor: false, dir: tmpDir });
    const content = await fs.readFile(path.join(tmpDir, 'berth.config.js'), 'utf-8');
    expect(content).toContain('export default');
    expect(content).toContain('3000');
    expect(content).toContain('5432');
  });

  it('writes JSON format when --format json', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await initCommand({
      json: false,
      verbose: false,
      noColor: false,
      dir: tmpDir,
      format: 'json',
    });
    const parsed = JSON.parse(await fs.readFile(path.join(tmpDir, '.berthrc.json'), 'utf-8'));
    expect(parsed.projectName).toBe(path.basename(tmpDir));
    expect(Object.values(parsed.ports)).toContain(3000);
  });

  it('refuses to overwrite without --force', async () => {
    await fs.writeFile(path.join(tmpDir, 'berth.config.js'), '// existing\n');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await initCommand({ json: false, verbose: false, noColor: false, dir: tmpDir });
    expect(process.exitCode).toBe(1);
    const content = await fs.readFile(path.join(tmpDir, 'berth.config.js'), 'utf-8');
    expect(content).toBe('// existing\n');
  });

  it('overwrites with --force', async () => {
    await fs.writeFile(path.join(tmpDir, 'berth.config.js'), '// existing\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await initCommand({
      json: false,
      verbose: false,
      noColor: false,
      dir: tmpDir,
      force: true,
    });
    const content = await fs.readFile(path.join(tmpDir, 'berth.config.js'), 'utf-8');
    expect(content).toContain('export default');
  });
});
