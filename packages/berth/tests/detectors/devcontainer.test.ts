import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectFromDevcontainer } from '../../src/detectors/configured/devcontainer.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-devcontainer-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeDevcontainer(contents: object) {
  await fs.mkdir(path.join(tmpDir, '.devcontainer'), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, '.devcontainer', 'devcontainer.json'),
    JSON.stringify(contents),
  );
}

describe('detectFromDevcontainer', () => {
  it('extracts forwardPorts as high confidence', async () => {
    await writeDevcontainer({ name: 'dev', forwardPorts: [3000, '4000'] });
    const ports = await detectFromDevcontainer(tmpDir);
    expect(ports.map((p) => p.port).sort()).toEqual([3000, 4000]);
    expect(ports.every((p) => p.confidence === 'high')).toBe(true);
    expect(ports[0].projectName).toBe('dev');
  });

  it('extracts appPort (scalar or array)', async () => {
    await writeDevcontainer({ appPort: 8080 });
    const ports = await detectFromDevcontainer(tmpDir);
    expect(ports.map((p) => p.port)).toEqual([8080]);
  });

  it('extracts portsAttributes as medium confidence with label context', async () => {
    await writeDevcontainer({
      portsAttributes: { '5432': { label: 'Postgres' } },
    });
    const ports = await detectFromDevcontainer(tmpDir);
    expect(ports).toHaveLength(1);
    expect(ports[0].port).toBe(5432);
    expect(ports[0].confidence).toBe('medium');
    expect(ports[0].context).toContain('Postgres');
  });

  it('deduplicates ports across forwardPorts and portsAttributes', async () => {
    await writeDevcontainer({
      forwardPorts: [3000],
      portsAttributes: { '3000': { label: 'Dev' } },
    });
    const ports = await detectFromDevcontainer(tmpDir);
    expect(ports).toHaveLength(1);
    expect(ports[0].confidence).toBe('high');
  });

  it('returns [] when neither file exists', async () => {
    const ports = await detectFromDevcontainer(tmpDir);
    expect(ports).toEqual([]);
  });

  it('also finds .devcontainer.json at the repo root', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.devcontainer.json'),
      JSON.stringify({ forwardPorts: [9000] }),
    );
    const ports = await detectFromDevcontainer(tmpDir);
    expect(ports.map((p) => p.port)).toEqual([9000]);
  });
});
