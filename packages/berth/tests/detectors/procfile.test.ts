import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectFromProcfile } from '../../src/detectors/configured/procfile.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portmap-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('detectFromProcfile', () => {
  it('should detect PORT= in commands', async () => {
    await fs.writeFile(path.join(tmpDir, 'Procfile'), 'web: PORT=3000 node server.js\n');
    const ports = await detectFromProcfile(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(3000);
    expect(ports[0].confidence).toBe('medium');
  });

  it('should detect --port flag', async () => {
    await fs.writeFile(path.join(tmpDir, 'Procfile'), 'web: next start --port 3000\nworker: node worker.js\n');
    const ports = await detectFromProcfile(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(3000);
  });

  it('should handle multiple processes', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Procfile'),
      'web: node server.js --port 3000\napi: node api.js --port 8080\n',
    );
    const ports = await detectFromProcfile(tmpDir);
    expect(ports.length).toBe(2);
    expect(ports.map((p) => p.port).sort()).toEqual([3000, 8080]);
  });

  it('should return empty for missing Procfile', async () => {
    const ports = await detectFromProcfile(tmpDir);
    expect(ports.length).toBe(0);
  });
});
