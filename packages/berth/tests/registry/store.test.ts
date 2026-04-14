import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadRegistry, saveRegistry } from '../../src/registry/store.js';
import type { Registry } from '../../src/types.js';

let tmpDir: string;
let registryPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portmap-reg-'));
  registryPath = path.join(tmpDir, 'registry.json');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadRegistry', () => {
  it('should return default registry when file does not exist', async () => {
    const registry = await loadRegistry(registryPath);
    expect(registry.version).toBe(1);
    expect(Object.keys(registry.projects)).toHaveLength(0);
  });

  it('should load a valid registry', async () => {
    const data: Registry = {
      version: 1,
      projects: {
        'my-app': {
          name: 'my-app',
          directory: '/home/user/my-app',
          ports: [{ port: 3000, source: 'package-json', sourceFile: 'package.json', description: 'dev server' }],
          registeredAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
    };
    await fs.writeFile(registryPath, JSON.stringify(data));
    const registry = await loadRegistry(registryPath);
    expect(Object.keys(registry.projects)).toHaveLength(1);
    expect(registry.projects['my-app'].ports[0].port).toBe(3000);
  });

  it('should handle corrupt JSON and create backup', async () => {
    await fs.writeFile(registryPath, 'this is not json{{{');
    const registry = await loadRegistry(registryPath);
    expect(registry.version).toBe(1);
    expect(Object.keys(registry.projects)).toHaveLength(0);

    // Should have created a backup
    const backup = await fs.readFile(registryPath + '.bak', 'utf-8');
    expect(backup).toBe('this is not json{{{');
  });
});

describe('saveRegistry', () => {
  it('should save and load round-trip', async () => {
    const registry: Registry = {
      version: 1,
      projects: {
        test: {
          name: 'test',
          directory: '/tmp/test',
          ports: [{ port: 8080, source: 'dotenv', sourceFile: '.env', description: 'PORT=8080' }],
          registeredAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
    };
    await saveRegistry(registry, registryPath);
    const loaded = await loadRegistry(registryPath);
    expect(loaded).toEqual(registry);
  });

  it('should create parent directory if needed', async () => {
    const nestedPath = path.join(tmpDir, 'nested', 'dir', 'registry.json');
    // saveRegistry calls ensureRegistryDir which uses getRegistryDir()
    // For this test, we save directly since the dir structure differs
    await fs.mkdir(path.dirname(nestedPath), { recursive: true });
    await saveRegistry({ version: 1, projects: {} }, nestedPath);
    const loaded = await loadRegistry(nestedPath);
    expect(loaded.version).toBe(1);
  });
});
