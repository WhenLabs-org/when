import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectWorkspaces } from '../../src/parsers/workspaces.js';

describe('detectWorkspaces', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stale-ws-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns isMonorepo=false for a flat project', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'solo' }));
    const layout = await detectWorkspaces(dir);
    expect(layout.isMonorepo).toBe(false);
    expect(layout.workspaces).toEqual([]);
  });

  it('detects npm/yarn workspaces array', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'root',
      workspaces: ['packages/*'],
    }));
    await mkdir(join(dir, 'packages/a'), { recursive: true });
    await writeFile(join(dir, 'packages/a/package.json'), JSON.stringify({
      name: '@org/a',
      scripts: { build: 'tsc' },
    }));
    await mkdir(join(dir, 'packages/b'), { recursive: true });
    await writeFile(join(dir, 'packages/b/package.json'), JSON.stringify({
      name: '@org/b',
    }));

    const layout = await detectWorkspaces(dir);
    expect(layout.isMonorepo).toBe(true);
    expect(layout.workspaces).toHaveLength(2);
    const names = layout.workspaces.map((w) => w.name).sort();
    expect(names).toEqual(['@org/a', '@org/b']);
  });

  it('detects pnpm workspace file', async () => {
    await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
    await mkdir(join(dir, 'apps/web'), { recursive: true });
    await writeFile(join(dir, 'apps/web/package.json'), JSON.stringify({ name: 'web' }));

    const layout = await detectWorkspaces(dir);
    expect(layout.isMonorepo).toBe(true);
    expect(layout.workspaces[0].name).toBe('web');
    expect(layout.workspaces[0].relativePath).toBe('apps/web');
  });
});
