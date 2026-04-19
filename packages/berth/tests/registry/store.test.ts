import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadRegistry, saveRegistry } from '../../src/registry/store.js';
import type { Registry, RegistryV1 } from '../../src/types.js';

let tmpDir: string;
let registryPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-reg-'));
  registryPath = path.join(tmpDir, 'registry.json');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadRegistry', () => {
  it('returns a fresh v2 registry when the file does not exist', async () => {
    const registry = await loadRegistry(registryPath);
    expect(registry.version).toBe(2);
    expect(Object.keys(registry.projects)).toHaveLength(0);
    expect(registry.reservations).toEqual([]);
  });

  it('loads a valid v2 registry round-trip', async () => {
    const data: Registry = {
      version: 2,
      projects: {
        'my-app': {
          name: 'my-app',
          directory: '/home/user/my-app',
          ports: [{ port: 3000, source: 'package-json', sourceFile: 'package.json', description: 'dev server' }],
          registeredAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
      reservations: [
        {
          port: 4000,
          project: 'my-app',
          source: 'manual',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ],
    };
    await fs.writeFile(registryPath, JSON.stringify(data));
    const registry = await loadRegistry(registryPath);
    expect(registry).toEqual(data);
  });

  it('handles corrupt JSON and creates a backup', async () => {
    await fs.writeFile(registryPath, 'this is not json{{{');
    const registry = await loadRegistry(registryPath);
    expect(registry.version).toBe(2);
    expect(Object.keys(registry.projects)).toHaveLength(0);

    const backup = await fs.readFile(registryPath + '.bak', 'utf-8');
    expect(backup).toBe('this is not json{{{');
  });

  it('migrates a v1 registry to v2 on read', async () => {
    const v1: RegistryV1 = {
      version: 1,
      projects: {
        legacy: {
          name: 'legacy',
          directory: '/tmp/legacy',
          ports: [
            { port: 3000, source: 'package-json', sourceFile: 'package.json', description: 'old' },
          ],
          registeredAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
        },
      },
    };
    await fs.writeFile(registryPath, JSON.stringify(v1));

    const migrated = await loadRegistry(registryPath);
    expect(migrated.version).toBe(2);
    expect(migrated.projects.legacy.ports[0].port).toBe(3000);
    expect(migrated.reservations).toEqual([]);
    expect(migrated.meta?.lastMigratedFrom).toBe(1);

    // v1 backup alongside the now-rewritten v2 file
    const v1Backup = JSON.parse(await fs.readFile(registryPath + '.v1.bak', 'utf-8'));
    expect(v1Backup.version).toBe(1);

    // File on disk should now be v2
    const onDisk = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
    expect(onDisk.version).toBe(2);
  });
});

describe('saveRegistry', () => {
  it('saves and reloads a registry without drift', async () => {
    const registry: Registry = {
      version: 2,
      projects: {
        test: {
          name: 'test',
          directory: '/tmp/test',
          ports: [{ port: 8080, source: 'dotenv', sourceFile: '.env', description: 'PORT=8080' }],
          registeredAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
      reservations: [],
    };
    await saveRegistry(registry, registryPath);
    const loaded = await loadRegistry(registryPath);
    expect(loaded).toEqual(registry);
  });

  it('creates parent directory if needed', async () => {
    const nestedPath = path.join(tmpDir, 'nested', 'dir', 'registry.json');
    await fs.mkdir(path.dirname(nestedPath), { recursive: true });
    await saveRegistry({ version: 2, projects: {}, reservations: [] }, nestedPath);
    const loaded = await loadRegistry(nestedPath);
    expect(loaded.version).toBe(2);
  });
});
