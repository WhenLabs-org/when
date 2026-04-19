import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectFromPackageJson } from '../../src/detectors/configured/package-json.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portmap-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('detectFromPackageJson', () => {
  it('should detect --port flag in scripts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { dev: 'vite --port 5174' },
      }),
    );
    const ports = await detectFromPackageJson(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(5174);
    expect(ports[0].confidence).toBe('high');
  });

  it('should detect PORT= in scripts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { start: 'PORT=4000 node server.js' },
      }),
    );
    const ports = await detectFromPackageJson(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(4000);
  });

  it('should detect -p flag', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { dev: 'next dev -p 3001' },
        dependencies: { next: '^14.0.0' },
      }),
    );
    const ports = await detectFromPackageJson(tmpDir);
    // Should find explicit port 3001 but NOT add Next.js default 3000
    const explicit = ports.filter((p) => p.confidence === 'high');
    expect(explicit.length).toBe(1);
    expect(explicit[0].port).toBe(3001);
  });

  it('should add framework default if no explicit port', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { dev: 'next dev' },
        dependencies: { next: '^14.0.0' },
      }),
    );
    const ports = await detectFromPackageJson(tmpDir);
    expect(ports.length).toBeGreaterThanOrEqual(1);
    const nextDefault = ports.find((p) => p.port === 3000);
    expect(nextDefault).toBeDefined();
  });

  it('should handle cross-env PORT=', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { start: 'cross-env PORT=3000 react-scripts start' },
        dependencies: { 'react-scripts': '^5.0.0' },
      }),
    );
    const ports = await detectFromPackageJson(tmpDir);
    const explicit = ports.filter((p) => p.port === 3000 && p.confidence === 'high');
    expect(explicit.length).toBe(1);
  });

  it('should return empty for missing package.json', async () => {
    const ports = await detectFromPackageJson(tmpDir);
    expect(ports.length).toBe(0);
  });

  it('should handle multiple ports in scripts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          dev: 'vite --port 3000',
          storybook: 'storybook dev -p 6006',
        },
        devDependencies: { storybook: '^8.0.0', vite: '^5.0.0' },
      }),
    );
    const ports = await detectFromPackageJson(tmpDir);
    const highConfidence = ports.filter((p) => p.confidence === 'high');
    expect(highConfidence.length).toBe(2);
    expect(highConfidence.map((p) => p.port).sort()).toEqual([3000, 6006]);
  });
});
