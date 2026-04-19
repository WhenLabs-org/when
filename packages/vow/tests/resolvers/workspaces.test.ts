import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverWorkspaces } from '../../src/resolvers/workspaces.js';

async function writeJSON(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

describe('discoverWorkspaces', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'vow-ws-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns empty array when no workspaces are configured', async () => {
    await writeJSON(path.join(root, 'package.json'), { name: 'solo', version: '1.0.0' });
    expect(await discoverWorkspaces(root)).toEqual([]);
  });

  it('expands npm workspaces (array form) and collects direct deps', async () => {
    await writeJSON(path.join(root, 'package.json'), {
      name: 'mono',
      version: '1.0.0',
      workspaces: ['packages/*'],
    });
    await writeJSON(path.join(root, 'packages', 'app-a', 'package.json'), {
      name: '@mono/app-a',
      version: '1.0.0',
      dependencies: { lodash: '^4' },
      devDependencies: { jest: '^29' },
    });
    await writeJSON(path.join(root, 'packages', 'app-b', 'package.json'), {
      name: '@mono/app-b',
      version: '1.0.0',
      dependencies: { express: '^4' },
    });

    const workspaces = await discoverWorkspaces(root);
    expect(workspaces).toHaveLength(2);
    const byName = new Map(workspaces.map((w) => [w.name, w]));
    expect(byName.get('@mono/app-a')!.directDependencies).toEqual(['lodash', 'jest']);
    expect(byName.get('@mono/app-b')!.directDependencies).toEqual(['express']);
  });

  it('expands yarn-berry {packages: [...]} form', async () => {
    await writeJSON(path.join(root, 'package.json'), {
      name: 'mono',
      version: '1.0.0',
      workspaces: { packages: ['apps/*'] },
    });
    await writeJSON(path.join(root, 'apps', 'web', 'package.json'), {
      name: 'web',
      version: '1.0.0',
      dependencies: { react: '^18' },
    });

    const workspaces = await discoverWorkspaces(root);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]!.name).toBe('web');
    expect(workspaces[0]!.directDependencies).toEqual(['react']);
  });

  it('reads pnpm-workspace.yaml', async () => {
    await writeJSON(path.join(root, 'package.json'), { name: 'mono', version: '1.0.0' });
    await writeFile(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - "packages/*"\n  - "tools"\n',
      'utf-8',
    );
    await writeJSON(path.join(root, 'packages', 'a', 'package.json'), {
      name: 'a',
      version: '1.0.0',
      dependencies: { foo: '*' },
    });
    await writeJSON(path.join(root, 'tools', 'package.json'), {
      name: 'tools',
      version: '1.0.0',
      dependencies: { bar: '*' },
    });

    const workspaces = await discoverWorkspaces(root);
    expect(workspaces.map((w) => w.name).sort()).toEqual(['a', 'tools']);
  });

  it('skips dotfile entries when expanding *', async () => {
    await writeJSON(path.join(root, 'package.json'), {
      name: 'mono',
      version: '1.0.0',
      workspaces: ['packages/*'],
    });
    await mkdir(path.join(root, 'packages', '.hidden'), { recursive: true });
    await writeJSON(path.join(root, 'packages', 'real', 'package.json'), {
      name: 'real',
      version: '1.0.0',
    });

    const workspaces = await discoverWorkspaces(root);
    expect(workspaces.map((w) => w.name)).toEqual(['real']);
  });

  it('falls back to directory basename when workspace package.json has no name', async () => {
    await writeJSON(path.join(root, 'package.json'), {
      name: 'mono',
      version: '1.0.0',
      workspaces: ['pkgs/*'],
    });
    await writeJSON(path.join(root, 'pkgs', 'nameless', 'package.json'), {
      version: '1.0.0',
    });

    const workspaces = await discoverWorkspaces(root);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]!.name).toBe('nameless');
  });

  it('ignores workspace entries whose package.json is missing or invalid', async () => {
    await writeJSON(path.join(root, 'package.json'), {
      name: 'mono',
      version: '1.0.0',
      workspaces: ['packages/*'],
    });
    await mkdir(path.join(root, 'packages', 'empty'), { recursive: true });
    await mkdir(path.join(root, 'packages', 'broken'), { recursive: true });
    await writeFile(path.join(root, 'packages', 'broken', 'package.json'), '{not json', 'utf-8');
    await writeJSON(path.join(root, 'packages', 'ok', 'package.json'), {
      name: 'ok',
      version: '1.0.0',
    });

    const workspaces = await discoverWorkspaces(root);
    expect(workspaces.map((w) => w.name)).toEqual(['ok']);
  });
});
