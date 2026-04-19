import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectFromMakefile } from '../../src/detectors/configured/makefile.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portmap-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('detectFromMakefile', () => {
  it('should detect --port in make targets', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Makefile'),
      'dev:\n\tnpx vite --port 3000\n',
    );
    const ports = await detectFromMakefile(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(3000);
    expect(ports[0].context).toContain('make dev');
  });

  it('should detect PORT= in make targets', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Makefile'),
      'start:\n\tPORT=8080 node server.js\n',
    );
    const ports = await detectFromMakefile(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(8080);
  });

  it('should detect localhost:port patterns', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Makefile'),
      'test:\n\tcurl http://localhost:4000/health\n',
    );
    const ports = await detectFromMakefile(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(4000);
  });

  it('should skip privileged ports (<=1024)', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Makefile'),
      'deploy:\n\tnginx -p 80\n',
    );
    const ports = await detectFromMakefile(tmpDir);
    expect(ports.length).toBe(0);
  });

  it('should handle multiple targets', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Makefile'),
      'frontend:\n\tvite --port 3000\n\nbackend:\n\tPORT=8080 node api.js\n',
    );
    const ports = await detectFromMakefile(tmpDir);
    expect(ports.length).toBe(2);
    expect(ports.map((p) => p.port).sort()).toEqual([3000, 8080]);
  });

  it('should return empty for missing Makefile', async () => {
    const ports = await detectFromMakefile(tmpDir);
    expect(ports.length).toBe(0);
  });

  it('should deduplicate ports', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'Makefile'),
      'dev:\n\tvite --port 3000\nstart:\n\tvite --port 3000\n',
    );
    const ports = await detectFromMakefile(tmpDir);
    expect(ports.length).toBe(1);
  });
});
