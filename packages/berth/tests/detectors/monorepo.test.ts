import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectFromPackageJson } from '../../src/detectors/configured/package-json.js';
import { detectAllConfigured } from '../../src/detectors/index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-monorepo-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

describe('Turborepo monorepo', () => {
  beforeEach(async () => {
    await writeJson(path.join(tmpDir, 'package.json'), {
      name: 'turbo-monorepo',
      private: true,
      workspaces: ['apps/*', 'packages/*'],
      scripts: { dev: 'turbo run dev', build: 'turbo run build' },
      devDependencies: { turbo: '^2.0.0' },
    });
    await writeJson(path.join(tmpDir, 'turbo.json'), {
      $schema: 'https://turbo.build/schema.json',
      tasks: { dev: { cache: false, persistent: true } },
    });
    await writeJson(path.join(tmpDir, 'apps', 'web', 'package.json'), {
      name: '@turbo/web',
      scripts: { dev: 'next dev --port 3000' },
      dependencies: { next: '^14.0.0', react: '^18.0.0' },
    });
    await writeJson(path.join(tmpDir, 'apps', 'api', 'package.json'), {
      name: '@turbo/api',
      scripts: { dev: 'fastify start -p 4000' },
      dependencies: { fastify: '^4.0.0' },
    });
    await writeJson(path.join(tmpDir, 'apps', 'docs', 'package.json'), {
      name: '@turbo/docs',
      scripts: { dev: 'astro dev --port 4321' },
      dependencies: { astro: '^4.0.0' },
    });
  });

  it('scanning the root picks up only root scripts, not workspace children', async () => {
    const ports = await detectFromPackageJson(tmpDir);
    const explicit = ports.filter((p) => p.confidence === 'high');
    expect(explicit).toHaveLength(0); // root scripts have no port flags
  });

  it('scanning apps/web finds Next.js explicit port 3000', async () => {
    const ports = await detectFromPackageJson(path.join(tmpDir, 'apps', 'web'));
    const explicit = ports.filter((p) => p.confidence === 'high');
    expect(explicit.map((p) => p.port)).toEqual([3000]);
    expect(explicit[0].projectName).toBe('@turbo/web');
  });

  it('scanning apps/api finds Fastify explicit port 4000', async () => {
    const ports = await detectFromPackageJson(path.join(tmpDir, 'apps', 'api'));
    const explicit = ports.filter((p) => p.confidence === 'high');
    expect(explicit.map((p) => p.port)).toEqual([4000]);
  });

  it('scanning apps/docs finds Astro explicit port 4321', async () => {
    const ports = await detectFromPackageJson(path.join(tmpDir, 'apps', 'docs'));
    const explicit = ports.filter((p) => p.confidence === 'high');
    expect(explicit.map((p) => p.port)).toEqual([4321]);
  });

  it('detectAllConfigured on root reports no explicit workspace-child ports (known limitation)', async () => {
    const { ports } = await detectAllConfigured(tmpDir);
    // Document current behavior: root scan does not recurse into workspaces.
    // This test pins the limitation so it surfaces if recursion is later added.
    const explicitChildPorts = ports.filter(
      (p) => p.confidence === 'high' && (p.port === 3000 || p.port === 4000 || p.port === 4321),
    );
    expect(explicitChildPorts).toHaveLength(0);
  });
});

describe('pnpm workspace', () => {
  beforeEach(async () => {
    await writeJson(path.join(tmpDir, 'package.json'), {
      name: 'pnpm-monorepo',
      private: true,
      scripts: { dev: 'pnpm --parallel -r dev' },
    });
    await writeFile(
      path.join(tmpDir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    await writeJson(path.join(tmpDir, 'packages', 'frontend', 'package.json'), {
      name: '@pnpm/frontend',
      scripts: { dev: 'vite --port 5173' },
      devDependencies: { vite: '^5.0.0' },
    });
    await writeJson(path.join(tmpDir, 'packages', 'backend', 'package.json'), {
      name: '@pnpm/backend',
      scripts: { dev: 'node server.js --port 8080' },
    });
  });

  it('scanning a pnpm sub-package finds its explicit port', async () => {
    const ports = await detectFromPackageJson(path.join(tmpDir, 'packages', 'frontend'));
    const explicit = ports.filter((p) => p.confidence === 'high');
    expect(explicit.map((p) => p.port)).toEqual([5173]);
  });

  it('duplicate ports across sibling packages are visible when each is scanned', async () => {
    await writeJson(path.join(tmpDir, 'packages', 'extra', 'package.json'), {
      name: '@pnpm/extra',
      scripts: { dev: 'vite --port 5173' },
      devDependencies: { vite: '^5.0.0' },
    });
    const frontend = await detectFromPackageJson(path.join(tmpDir, 'packages', 'frontend'));
    const extra = await detectFromPackageJson(path.join(tmpDir, 'packages', 'extra'));
    expect(frontend.some((p) => p.port === 5173)).toBe(true);
    expect(extra.some((p) => p.port === 5173)).toBe(true);
    // Same port, different project names — conflicts.ts should surface this.
    expect(frontend[0].projectName).not.toBe(extra[0].projectName);
  });
});

describe('Nx workspace (known limitation: project.json not yet parsed)', () => {
  beforeEach(async () => {
    await writeJson(path.join(tmpDir, 'nx.json'), {
      $schema: './node_modules/nx/schemas/nx-schema.json',
      targetDefaults: { build: { cache: true } },
    });
    await writeJson(path.join(tmpDir, 'package.json'), {
      name: 'nx-monorepo',
      private: true,
      devDependencies: { nx: '^18.0.0' },
    });
    await writeJson(path.join(tmpDir, 'apps', 'frontend', 'project.json'), {
      name: 'frontend',
      targets: {
        serve: { executor: '@nx/webpack:dev-server', options: { port: 4200 } },
      },
    });
  });

  it('does NOT detect Nx project.json ports today (follow-up for Phase 1 plugin)', async () => {
    const ports = await detectFromPackageJson(path.join(tmpDir, 'apps', 'frontend'));
    // No package.json in apps/frontend, and no project.json detector exists yet.
    expect(ports).toHaveLength(0);
  });

  it('detectAllConfigured on Nx app dir returns no high-confidence Nx target ports', async () => {
    const { ports } = await detectAllConfigured(path.join(tmpDir, 'apps', 'frontend'));
    const explicit = ports.filter((p) => p.confidence === 'high');
    expect(explicit.some((p) => p.port === 4200)).toBe(false);
  });
});
