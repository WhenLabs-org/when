import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import {
  detectEnvironment,
  resetEnvironmentCache,
} from '../../src/utils/environment.js';

const envSnapshot = { ...process.env };

beforeEach(() => {
  resetEnvironmentCache();
  // Wipe vars we care about so detection is deterministic.
  delete process.env.REMOTE_CONTAINERS;
  delete process.env.DEVCONTAINER;
  delete process.env.CODESPACES;
  delete process.env.WSL_DISTRO_NAME;
  delete process.env.SSH_CONNECTION;
  delete process.env.SSH_TTY;
});

afterEach(() => {
  process.env = { ...envSnapshot };
  vi.restoreAllMocks();
  resetEnvironmentCache();
});

describe('detectEnvironment', () => {
  it('reports host when no signals are present', async () => {
    vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));
    const env = await detectEnvironment();
    expect(env.kind).toBe('host');
  });

  it('reports wsl2 when WSL_DISTRO_NAME is set', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu-22.04';
    vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));
    const env = await detectEnvironment();
    expect(env.kind).toBe('wsl2');
    expect(env.detail).toBe('Ubuntu-22.04');
  });

  it('reports devcontainer when REMOTE_CONTAINERS=true', async () => {
    process.env.REMOTE_CONTAINERS = 'true';
    const env = await detectEnvironment();
    expect(env.kind).toBe('devcontainer');
  });

  it('reports devcontainer + Codespaces detail', async () => {
    process.env.REMOTE_CONTAINERS = 'true';
    process.env.CODESPACES = 'true';
    const env = await detectEnvironment();
    expect(env.kind).toBe('devcontainer');
    expect(env.detail).toBe('GitHub Codespaces');
  });

  it('reports docker-container when /.dockerenv exists', async () => {
    vi.spyOn(fs, 'access').mockImplementation(async (p) => {
      if (String(p) === '/.dockerenv') return undefined;
      throw new Error('ENOENT');
    });
    const env = await detectEnvironment();
    expect(env.kind).toBe('docker-container');
  });

  it('reports ssh when SSH_CONNECTION is set', async () => {
    process.env.SSH_CONNECTION = '10.0.0.1 54321 10.0.0.2 22';
    vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));
    const env = await detectEnvironment();
    expect(env.kind).toBe('ssh');
    expect(env.detail).toBe('10.0.0.2');
  });

  it('caches the detected environment', async () => {
    vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));
    const env1 = await detectEnvironment();
    process.env.REMOTE_CONTAINERS = 'true';
    const env2 = await detectEnvironment();
    expect(env2).toBe(env1); // cached
    resetEnvironmentCache();
    const env3 = await detectEnvironment();
    expect(env3.kind).toBe('devcontainer');
  });
});
