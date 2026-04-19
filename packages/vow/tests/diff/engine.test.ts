import { describe, it, expect } from 'vitest';
import { diffScans } from '../../src/diff/engine.js';
import type { PackageInfo, ScanResultJSON } from '../../src/types.js';

function makePkg(
  name: string,
  version: string,
  spdx: string | null,
  category: PackageInfo['license']['category'],
  ecosystem: string = 'npm',
): PackageInfo {
  return {
    name,
    version,
    ecosystem,
    dependencyType: 'production',
    license: {
      spdxExpression: spdx,
      source: spdx ? 'package-metadata' : 'none',
      confidence: spdx ? 1 : 0,
      category,
    },
  };
}

function makeScan(name: string, packages: PackageInfo[]): ScanResultJSON {
  return {
    timestamp: '2026-04-19T00:00:00Z',
    project: { name, version: '1.0.0', path: '/tmp/p' },
    packages,
    graph: {},
    summary: {
      total: packages.length,
      byLicense: {},
      byCategory: {},
      unknown: 0,
      custom: 0,
    },
    ecosystems: ['npm'],
    workspaces: [],
  };
}

describe('diffScans', () => {
  it('flags an added dep as info when permissive', () => {
    const baseline = makeScan('app', []);
    const current = makeScan('app', [makePkg('lodash', '4.17.21', 'MIT', 'permissive')]);

    const diff = diffScans(baseline, current);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.severity).toBe('info');
    expect(diff.added[0]!.name).toBe('lodash');
    expect(diff.summary.errors).toBe(0);
  });

  it('flags an added AGPL dep as error', () => {
    const baseline = makeScan('app', []);
    const current = makeScan('app', [makePkg('evil', '1.0.0', 'AGPL-3.0-only', 'network-copyleft')]);

    const diff = diffScans(baseline, current);
    expect(diff.added[0]!.severity).toBe('error');
    expect(diff.summary.errors).toBe(1);
  });

  it('removes deps emit info severity', () => {
    const baseline = makeScan('app', [makePkg('gone', '1.0.0', 'MIT', 'permissive')]);
    const current = makeScan('app', []);

    const diff = diffScans(baseline, current);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]!.severity).toBe('info');
  });

  it('version bumped, license unchanged: info', () => {
    const baseline = makeScan('app', [makePkg('a', '1.0.0', 'MIT', 'permissive')]);
    const current = makeScan('app', [makePkg('a', '1.0.1', 'MIT', 'permissive')]);

    const diff = diffScans(baseline, current);
    expect(diff.versionChanged).toHaveLength(1);
    expect(diff.versionChanged[0]!.licenseChanged).toBe(false);
    expect(diff.versionChanged[0]!.severity).toBe('info');
  });

  it('version bumped with MIT -> GPL (permissive -> strongly-copyleft): error', () => {
    const baseline = makeScan('app', [makePkg('a', '1.0.0', 'MIT', 'permissive')]);
    const current = makeScan('app', [makePkg('a', '2.0.0', 'GPL-3.0-only', 'strongly-copyleft')]);

    const diff = diffScans(baseline, current);
    expect(diff.versionChanged).toHaveLength(1);
    expect(diff.versionChanged[0]!.licenseChanged).toBe(true);
    expect(diff.versionChanged[0]!.severity).toBe('error');
  });

  it('version bumped with MIT -> LGPL (permissive -> weakly-copyleft): warning', () => {
    const baseline = makeScan('app', [makePkg('a', '1.0.0', 'MIT', 'permissive')]);
    const current = makeScan('app', [makePkg('a', '2.0.0', 'LGPL-3.0-only', 'weakly-copyleft')]);

    const diff = diffScans(baseline, current);
    expect(diff.versionChanged[0]!.severity).toBe('warning');
  });

  it('same version but license changed (rare): surfaces as license-changed', () => {
    const baseline = makeScan('app', [makePkg('a', '1.0.0', 'MIT', 'permissive')]);
    const current = makeScan('app', [makePkg('a', '1.0.0', 'GPL-3.0-only', 'strongly-copyleft')]);

    const diff = diffScans(baseline, current);
    expect(diff.licenseChanged).toHaveLength(1);
    expect(diff.licenseChanged[0]!.severity).toBe('error');
    expect(diff.versionChanged).toHaveLength(0);
  });

  it('license upgrade (GPL -> MIT) is info, not warning', () => {
    const baseline = makeScan('app', [
      makePkg('a', '1.0.0', 'GPL-3.0-only', 'strongly-copyleft'),
    ]);
    const current = makeScan('app', [makePkg('a', '1.0.0', 'MIT', 'permissive')]);

    const diff = diffScans(baseline, current);
    expect(diff.licenseChanged[0]!.severity).toBe('info');
  });

  it('distinguishes same-name packages in different ecosystems', () => {
    const baseline = makeScan('app', [makePkg('foo', '1.0.0', 'MIT', 'permissive', 'npm')]);
    const current = makeScan('app', [
      makePkg('foo', '1.0.0', 'MIT', 'permissive', 'npm'),
      makePkg('foo', '2.0.0', 'MIT', 'permissive', 'cargo'),
    ]);

    const diff = diffScans(baseline, current);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.ecosystem).toBe('cargo');
    expect(diff.versionChanged).toHaveLength(0);
  });

  it('empty diff when scans match', () => {
    const pkgs = [makePkg('a', '1.0.0', 'MIT', 'permissive')];
    const diff = diffScans(makeScan('app', pkgs), makeScan('app', pkgs));
    expect(diff.summary.total).toBe(0);
  });

  it('license -> unknown is treated as an error (compliance regression)', () => {
    const baseline = makeScan('app', [makePkg('a', '1.0.0', 'MIT', 'permissive')]);
    const current = makeScan('app', [makePkg('a', '1.0.0', null, 'unknown')]);

    const diff = diffScans(baseline, current);
    expect(diff.licenseChanged[0]!.severity).toBe('error');
  });
});
