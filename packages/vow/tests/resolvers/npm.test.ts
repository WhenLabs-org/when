import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { NpmResolver } from '../../src/resolvers/npm.js';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'npm');

describe('NpmResolver', () => {
  describe('detect', () => {
    it('detects package-lock.json', async () => {
      const resolver = new NpmResolver({
        projectPath: path.join(FIXTURES, 'simple'),
        includeDevDependencies: true,
      });
      expect(await resolver.detect()).toBe(true);
    });

    it('returns false for empty directory', async () => {
      const resolver = new NpmResolver({
        projectPath: '/tmp/nonexistent-project-dir',
        includeDevDependencies: true,
      });
      expect(await resolver.detect()).toBe(false);
    });
  });

  describe('resolve (simple fixture)', () => {
    it('resolves all packages from lockfile', async () => {
      const resolver = new NpmResolver({
        projectPath: path.join(FIXTURES, 'simple'),
        includeDevDependencies: true,
      });

      const packages = await resolver.resolve();
      expect(packages.length).toBe(4); // pkg-a, pkg-b, pkg-c, pkg-d

      const pkgA = packages.find(p => p.name === 'pkg-a');
      expect(pkgA).toBeDefined();
      expect(pkgA!.version).toBe('1.2.0');
      expect(pkgA!.license.spdxExpression).toBe('MIT');
      expect(pkgA!.license.source).toBe('package-metadata');
    });

    it('identifies dev dependencies', async () => {
      const resolver = new NpmResolver({
        projectPath: path.join(FIXTURES, 'simple'),
        includeDevDependencies: true,
      });

      const packages = await resolver.resolve();
      const pkgC = packages.find(p => p.name === 'pkg-c');
      expect(pkgC).toBeDefined();
      expect(pkgC!.dependencyType).toBe('dev');
    });

    it('skips dev dependencies when excluded', async () => {
      const resolver = new NpmResolver({
        projectPath: path.join(FIXTURES, 'simple'),
        includeDevDependencies: false,
      });

      const packages = await resolver.resolve();
      const pkgC = packages.find(p => p.name === 'pkg-c');
      expect(pkgC).toBeUndefined();
    });

    it('resolves transitive dependencies', async () => {
      const resolver = new NpmResolver({
        projectPath: path.join(FIXTURES, 'simple'),
        includeDevDependencies: true,
      });

      const packages = await resolver.resolve();
      const pkgD = packages.find(p => p.name === 'pkg-d');
      expect(pkgD).toBeDefined();
      expect(pkgD!.license.spdxExpression).toBe('ISC');
    });
  });

  describe('resolve (mixed-licenses fixture)', () => {
    it('resolves all license types', async () => {
      const resolver = new NpmResolver({
        projectPath: path.join(FIXTURES, 'mixed-licenses'),
        includeDevDependencies: true,
      });

      const packages = await resolver.resolve();
      expect(packages.length).toBe(6);

      const gplPkg = packages.find(p => p.name === 'gpl-pkg');
      expect(gplPkg!.license.spdxExpression).toBe('GPL-3.0-only');
      expect(gplPkg!.license.category).toBe('strongly-copyleft');

      const agplPkg = packages.find(p => p.name === 'agpl-pkg');
      expect(agplPkg!.license.spdxExpression).toBe('AGPL-3.0-only');
      expect(agplPkg!.license.category).toBe('network-copyleft');

      const dualPkg = packages.find(p => p.name === 'dual-license-pkg');
      expect(dualPkg!.license.spdxExpression).toBe('(MIT OR GPL-3.0-only)');
    });

    it('handles packages with no license field', async () => {
      const resolver = new NpmResolver({
        projectPath: path.join(FIXTURES, 'mixed-licenses'),
        includeDevDependencies: true,
      });

      const packages = await resolver.resolve();
      const unknownPkg = packages.find(p => p.name === 'unknown-pkg');
      expect(unknownPkg).toBeDefined();
      expect(unknownPkg!.license.category).toBe('unknown');
    });
  });
});
