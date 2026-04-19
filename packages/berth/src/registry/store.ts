import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Registry, RegistryV1 } from '../types.js';

export const CURRENT_REGISTRY_VERSION = 2;

export function getRegistryDir(): string {
  return path.join(os.homedir(), '.berth');
}

export function getRegistryPath(): string {
  return path.join(getRegistryDir(), 'registry.json');
}

export async function ensureRegistryDir(): Promise<void> {
  await fs.mkdir(getRegistryDir(), { recursive: true });
}

function freshRegistry(): Registry {
  return { version: 2, projects: {}, reservations: [] };
}

function isV1(data: unknown): data is RegistryV1 {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { version?: unknown }).version === 1 &&
    typeof (data as { projects?: unknown }).projects === 'object'
  );
}

function isV2(data: unknown): data is Registry {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { version?: unknown }).version === 2 &&
    typeof (data as { projects?: unknown }).projects === 'object' &&
    Array.isArray((data as { reservations?: unknown }).reservations)
  );
}

export function migrateV1toV2(v1: RegistryV1): Registry {
  return {
    version: 2,
    projects: v1.projects,
    reservations: [],
    meta: { lastMigratedFrom: 1 },
  };
}

export async function loadRegistry(registryPath?: string): Promise<Registry> {
  const filePath = registryPath ?? getRegistryPath();
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return freshRegistry();
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    await backupRegistry(filePath);
    return freshRegistry();
  }

  if (isV2(data)) return data;

  if (isV1(data)) {
    // Migrate in-place: back up the v1 file with a dedicated suffix, then save v2.
    await copyTo(filePath, filePath + '.v1.bak');
    const migrated = migrateV1toV2(data);
    try {
      await saveRegistry(migrated, filePath);
    } catch {
      // If save fails, still return the in-memory migrated data.
    }
    return migrated;
  }

  // Unknown schema — back up and return default.
  await backupRegistry(filePath);
  return freshRegistry();
}

export async function saveRegistry(registry: Registry, registryPath?: string): Promise<void> {
  const filePath = registryPath ?? getRegistryPath();
  await ensureRegistryDir();

  // Atomic write: write to tmp file, then rename
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  await fs.rename(tmpPath, filePath);
}

async function backupRegistry(filePath: string): Promise<void> {
  await copyTo(filePath, filePath + '.bak');
}

async function copyTo(src: string, dest: string): Promise<void> {
  try {
    await fs.copyFile(src, dest);
  } catch {
    // Best effort
  }
}
