import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { PnpmResolver, parsePnpmPkgKey } from '../../src/resolvers/pnpm.js';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'pnpm');

describe('parsePnpmPkgKey', () => {
  it('parses v6 leading-slash keys', () => {
    expect(parsePnpmPkgKey('/foo@1.2.3')).toEqual({ name: 'foo', version: '1.2.3' });
  });

  it('parses scoped packages', () => {
    expect(parsePnpmPkgKey('/@scope/bar@2.0.0')).toEqual({
      name: '@scope/bar',
      version: '2.0.0',
    });
  });

  it('parses v9 keys without a leading slash', () => {
    expect(parsePnpmPkgKey('foo@1.2.3')).toEqual({ name: 'foo', version: '1.2.3' });
  });

  it('strips peer-adjustment suffixes', () => {
    expect(parsePnpmPkgKey('/foo@1.2.3(peer@1.0.0)')).toEqual({
      name: 'foo',
      version: '1.2.3',
    });
  });
});

describe('PnpmResolver', () => {
  describe('detect', () => {
    it('detects pnpm-lock.yaml', async () => {
      const resolver = new PnpmResolver({
        projectPath: path.join(FIXTURES, 'simple'),
        includeDevDependencies: true,
      });
      expect(await resolver.detect()).toBe(true);
    });

    it('returns false when lockfile is absent', async () => {
      const resolver = new PnpmResolver({
        projectPath: '/tmp/nonexistent-pnpm-dir',
        includeDevDependencies: true,
      });
      expect(await resolver.detect()).toBe(false);
    });
  });

  describe('resolve', () => {
    it('enumerates packages and resolves licenses from the .pnpm store', async () => {
      const resolver = new PnpmResolver({
        projectPath: path.join(FIXTURES, 'simple'),
        includeDevDependencies: true,
      });
      const packages = await resolver.resolve();
      expect(packages.length).toBe(2);

      const a = packages.find((p) => p.name === 'pkg-a');
      expect(a?.version).toBe('1.0.0');
      expect(a?.license.spdxExpression).toBe('MIT');
      expect(a?.dependencyType).toBe('production');

      const b = packages.find((p) => p.name === 'pkg-b');
      expect(b?.version).toBe('2.0.0');
      expect(b?.license.spdxExpression).toBe('Apache-2.0');
      expect(b?.dependencyType).toBe('dev');
    });

    it('excludes dev dependencies when requested', async () => {
      const resolver = new PnpmResolver({
        projectPath: path.join(FIXTURES, 'simple'),
        includeDevDependencies: false,
      });
      const packages = await resolver.resolve();
      expect(packages.length).toBe(1);
      expect(packages[0]?.name).toBe('pkg-a');
    });
  });
});
