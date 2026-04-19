import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, clearConfigCache, mergeConfig } from '../../src/config/loader.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-cfg-'));
  // Pretend this is a project root so loadConfig doesn't walk past.
  await fs.mkdir(path.join(tmpDir, '.git'));
  clearConfigCache();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadConfig discovery', () => {
  it('returns null when no config is present', async () => {
    const result = await loadConfig(tmpDir);
    expect(result).toBeNull();
  });

  it('loads .berthrc.json (JSONC with trailing commas)', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.berthrc.json'),
      '{\n  "projectName": "jsonc-app",\n  "ports": { "web": 3000 },\n}\n',
    );
    const result = await loadConfig(tmpDir);
    expect(result?.filePath.endsWith('.berthrc.json')).toBe(true);
    expect(result?.config.projectName).toBe('jsonc-app');
    expect(result?.config.ports?.web).toBe(3000);
  });

  it('loads berth.config.mjs via default export', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'berth.config.mjs'),
      'export default { projectName: "mjs-app", ports: { web: 4000 } };\n',
    );
    const result = await loadConfig(tmpDir);
    expect(result?.config.projectName).toBe('mjs-app');
    expect(result?.config.ports?.web).toBe(4000);
  });

  it('loads config from package.json#berth', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'pkg-app',
        version: '0.0.0',
        berth: { projectName: 'pkg-app', ports: { web: 8080 } },
      }),
    );
    const result = await loadConfig(tmpDir);
    expect(result?.format).toBe('package-json');
    expect(result?.config.projectName).toBe('pkg-app');
    expect(result?.config.ports?.web).toBe(8080);
  });

  it('prefers the first candidate when multiple exist', async () => {
    // berth.config.js should be picked over .berthrc.json
    await fs.writeFile(
      path.join(tmpDir, 'berth.config.js'),
      'export default { projectName: "js-wins" };\n',
    );
    await fs.writeFile(
      path.join(tmpDir, '.berthrc.json'),
      '{ "projectName": "rc-loses" }',
    );
    const result = await loadConfig(tmpDir);
    expect(result?.config.projectName).toBe('js-wins');
  });

  it('walks upward to find a parent config, stopping at .git', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'berth.config.mjs'),
      'export default { projectName: "root-app", ports: { web: 3000 } };\n',
    );
    const nested = path.join(tmpDir, 'packages', 'deep');
    await fs.mkdir(nested, { recursive: true });
    const result = await loadConfig(nested);
    expect(result?.config.projectName).toBe('root-app');
  });

  it('throws a helpful error on schema violation', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.berthrc.json'),
      '{ "ports": { "web": "not-a-number" } }',
    );
    await expect(loadConfig(tmpDir)).rejects.toThrow(/ports\.web/);
  });
});

describe('mergeConfig', () => {
  it('merges ports with override winning', () => {
    const merged = mergeConfig(
      { ports: { web: 3000, api: 4000 } },
      { ports: { web: 3001 } },
    );
    expect(merged.ports?.web).toBe(3001);
    expect(merged.ports?.api).toBe(4000);
  });

  it('concatenates reservedRanges from both base and override', () => {
    const merged = mergeConfig(
      { reservedRanges: [{ from: 5000, to: 5010 }] },
      { reservedRanges: [{ from: 6000, to: 6010 }] },
    );
    expect(merged.reservedRanges).toHaveLength(2);
  });

  it('concatenates plugins in order', () => {
    const merged = mergeConfig(
      { plugins: ['./a.js'] },
      { plugins: ['./b.js'] },
    );
    expect(merged.plugins).toEqual(['./a.js', './b.js']);
  });
});

describe('loadConfig with extends', () => {
  it('loads and merges an extended config', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'base.json'),
      JSON.stringify({ ports: { web: 3000, shared: 9000 } }),
    );
    await fs.writeFile(
      path.join(tmpDir, '.berthrc.json'),
      JSON.stringify({ extends: './base.json', ports: { web: 3001 } }),
    );
    const result = await loadConfig(tmpDir);
    expect(result?.config.ports?.web).toBe(3001);
    expect(result?.config.ports?.shared).toBe(9000);
  });
});
