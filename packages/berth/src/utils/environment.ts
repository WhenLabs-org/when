import fs from 'node:fs/promises';
import type { EnvironmentInfo } from '../types.js';

let cached: EnvironmentInfo | undefined;

export function resetEnvironmentCache(): void {
  cached = undefined;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspect env vars and well-known marker files to classify the current
 * environment. Results are cached per-process.
 */
export async function detectEnvironment(): Promise<EnvironmentInfo> {
  if (cached) return cached;
  cached = await computeEnvironment();
  return cached;
}

async function computeEnvironment(): Promise<EnvironmentInfo> {
  const env = process.env;

  // VS Code / JetBrains devcontainers set REMOTE_CONTAINERS=true in shells
  // launched inside the container; `.devcontainer/devcontainer.json` and
  // /.devcontainer presence are also strong signals.
  if (env.REMOTE_CONTAINERS === 'true' || env.DEVCONTAINER === 'true') {
    return { kind: 'devcontainer', detail: env.CODESPACES === 'true' ? 'GitHub Codespaces' : undefined };
  }

  if (env.WSL_DISTRO_NAME) {
    return { kind: 'wsl2', detail: env.WSL_DISTRO_NAME };
  }

  if (await fileExists('/.dockerenv')) {
    return { kind: 'docker-container', detail: env.HOSTNAME };
  }

  if (env.SSH_CONNECTION || env.SSH_TTY) {
    const parts = (env.SSH_CONNECTION ?? '').split(/\s+/);
    const remote = parts[2];
    return { kind: 'ssh', detail: remote || undefined };
  }

  return { kind: 'host' };
}
