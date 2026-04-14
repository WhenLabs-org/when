import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Registry } from '../types.js';

const DEFAULT_REGISTRY: Registry = { version: 1, projects: {} };

export function getRegistryDir(): string {
  return path.join(os.homedir(), '.berth');
}

export function getRegistryPath(): string {
  return path.join(getRegistryDir(), 'registry.json');
}

export async function ensureRegistryDir(): Promise<void> {
  await fs.mkdir(getRegistryDir(), { recursive: true });
}

export async function loadRegistry(registryPath?: string): Promise<Registry> {
  const filePath = registryPath ?? getRegistryPath();
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return { ...DEFAULT_REGISTRY, projects: {} };
  }

  try {
    const data = JSON.parse(content);
    if (data && typeof data === 'object' && data.version === 1 && data.projects) {
      return data as Registry;
    }
    // Unknown version or invalid format — backup and return default
    await backupRegistry(filePath);
    return { ...DEFAULT_REGISTRY, projects: {} };
  } catch {
    // Corrupt JSON — backup and return default
    await backupRegistry(filePath);
    return { ...DEFAULT_REGISTRY, projects: {} };
  }
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
  try {
    await fs.copyFile(filePath, filePath + '.bak');
  } catch {
    // Best effort
  }
}
