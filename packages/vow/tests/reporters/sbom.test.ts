import { describe, it, expect } from 'vitest';
import { purlFor, toCycloneDx, toSpdx } from '../../src/reporters/sbom.js';
import type { DepGraphNode, PackageInfo, ScanResult } from '../../src/types.js';
import { pkgKey } from '../../src/types.js';

function makePkg(
  name: string,
  version: string,
  license: string | null,
  opts: { ecosystem?: string; dependencyType?: PackageInfo['dependencyType'] } = {},
): PackageInfo {
  return {
    name,
    version,
    ecosystem: opts.ecosystem ?? 'npm',
    dependencyType: opts.dependencyType ?? 'production',
    license: {
      spdxExpression: license,
      source: license ? 'package-metadata' : 'none',
      confidence: license ? 1 : 0,
      category: license ? 'permissive' : 'unknown',
    },
  };
}

function makeNode(pkg: PackageInfo, depth: number, deps: Array<[string, string]> = []): DepGraphNode {
  return {
    pkg,
    depth,
    dependencies: new Map(deps),
    dependents: new Map(),
  };
}

function makeScan(packages: PackageInfo[], graph: Map<string, DepGraphNode>): ScanResult {
  return {
    timestamp: '2026-04-19T00:00:00Z',
    project: { name: 'my-app', version: '1.0.0', path: '/tmp/my-app' },
    packages,
    graph,
    summary: { total: packages.length, byLicense: new Map(), byCategory: new Map(), unknown: 0, custom: 0 },
    ecosystems: ['npm'],
    workspaces: [],
  };
}

describe('purlFor', () => {
  it('npm package', () => {
    expect(purlFor(makePkg('lodash', '4.17.21', 'MIT'))).toBe('pkg:npm/lodash@4.17.21');
  });

  it('npm scoped package', () => {
    expect(purlFor(makePkg('@scope/name', '1.0.0', 'MIT'))).toBe('pkg:npm/%40scope/name@1.0.0');
  });

  it('cargo package', () => {
    expect(purlFor(makePkg('serde', '1.0.0', 'MIT', { ecosystem: 'cargo' }))).toBe(
      'pkg:cargo/serde@1.0.0',
    );
  });

  it('pip package (pypi purl type)', () => {
    expect(purlFor(makePkg('requests', '2.31.0', 'Apache-2.0', { ecosystem: 'pip' }))).toBe(
      'pkg:pypi/requests@2.31.0',
    );
  });

  it('url-encodes versions containing pluses', () => {
    expect(purlFor(makePkg('x', '1.0.0+build.1', 'MIT'))).toBe('pkg:npm/x@1.0.0%2Bbuild.1');
  });
});

describe('toCycloneDx', () => {
  it('produces a valid CycloneDX 1.5 BOM header', () => {
    const pkg = makePkg('lodash', '4.17.21', 'MIT');
    const graph = new Map([[pkgKey(pkg.name, pkg.version), makeNode(pkg, 1)]]);
    const bom = toCycloneDx(makeScan([pkg], graph), {
      now: new Date('2026-04-19T12:00:00Z'),
      documentId: 'aaaa',
    });

    expect(bom.bomFormat).toBe('CycloneDX');
    expect(bom.specVersion).toBe('1.5');
    expect(bom.serialNumber).toBe('urn:uuid:aaaa');
    expect(bom.version).toBe(1);
    expect(bom.metadata.timestamp).toBe('2026-04-19T12:00:00.000Z');
    expect(bom.metadata.component).toMatchObject({
      type: 'application',
      name: 'my-app',
      version: '1.0.0',
      'bom-ref': 'my-app@1.0.0',
    });
  });

  it('emits one component per package with purl + license id', () => {
    const a = makePkg('a', '1.0.0', 'MIT');
    const b = makePkg('b', '2.0.0', 'Apache-2.0');
    const graph = new Map([
      [pkgKey(a.name, a.version), makeNode(a, 1)],
      [pkgKey(b.name, b.version), makeNode(b, 1)],
    ]);
    const bom = toCycloneDx(makeScan([a, b], graph), { documentId: 'x' });

    expect(bom.components).toHaveLength(2);
    expect(bom.components[0]).toMatchObject({
      type: 'library',
      'bom-ref': 'pkg:npm/a@1.0.0',
      purl: 'pkg:npm/a@1.0.0',
      licenses: [{ license: { id: 'MIT' } }],
    });
    expect(bom.components[1]!.licenses).toEqual([{ license: { id: 'Apache-2.0' } }]);
  });

  it('uses the expression form for compound SPDX', () => {
    const pkg = makePkg('dual', '1.0.0', '(MIT OR Apache-2.0)');
    const graph = new Map([[pkgKey(pkg.name, pkg.version), makeNode(pkg, 1)]]);
    const bom = toCycloneDx(makeScan([pkg], graph), { documentId: 'x' });

    expect(bom.components[0]!.licenses).toEqual([{ expression: '(MIT OR Apache-2.0)' }]);
  });

  it('omits licenses when spdxExpression is null', () => {
    const pkg = makePkg('mystery', '1.0.0', null);
    const graph = new Map([[pkgKey(pkg.name, pkg.version), makeNode(pkg, 1)]]);
    const bom = toCycloneDx(makeScan([pkg], graph), { documentId: 'x' });

    expect(bom.components[0]!.licenses).toBeUndefined();
  });

  it('builds a dependency graph rooted at the project with depth-1 deps as children', () => {
    const a = makePkg('a', '1.0.0', 'MIT');
    const b = makePkg('b', '2.0.0', 'MIT');
    const graph = new Map([
      [pkgKey(a.name, a.version), makeNode(a, 1, [['b', '2.0.0']])],
      [pkgKey(b.name, b.version), makeNode(b, 2)],
    ]);
    const bom = toCycloneDx(makeScan([a, b], graph), { documentId: 'x' });

    const rootDep = bom.dependencies.find((d) => d.ref === 'my-app@1.0.0');
    expect(rootDep?.dependsOn).toEqual(['pkg:npm/a@1.0.0']);

    const aDep = bom.dependencies.find((d) => d.ref === 'pkg:npm/a@1.0.0');
    expect(aDep?.dependsOn).toEqual(['pkg:npm/b@2.0.0']);
  });

  it('marks optional deps with scope', () => {
    const pkg = makePkg('opt', '1.0.0', 'MIT', { dependencyType: 'optional' });
    const graph = new Map([[pkgKey(pkg.name, pkg.version), makeNode(pkg, 1)]]);
    const bom = toCycloneDx(makeScan([pkg], graph), { documentId: 'x' });
    expect(bom.components[0]!.scope).toBe('optional');
  });
});

describe('toSpdx', () => {
  it('produces a valid SPDX 2.3 document with DOCUMENT and root package', () => {
    const pkg = makePkg('lodash', '4.17.21', 'MIT');
    const graph = new Map([[pkgKey(pkg.name, pkg.version), makeNode(pkg, 1)]]);
    const doc = toSpdx(makeScan([pkg], graph), {
      now: new Date('2026-04-19T12:00:00Z'),
      documentId: 'abcd',
    });

    expect(doc.spdxVersion).toBe('SPDX-2.3');
    expect(doc.dataLicense).toBe('CC0-1.0');
    expect(doc.SPDXID).toBe('SPDXRef-DOCUMENT');
    expect(doc.name).toBe('my-app-1.0.0');
    expect(doc.documentNamespace).toBe('https://whenlabs.org/vow/spdx/abcd');
    expect(doc.creationInfo.created).toBe('2026-04-19T12:00:00.000Z');
    expect(doc.creationInfo.creators[0]).toBe('Tool: vow');
  });

  it('emits a DESCRIBES relationship from DOCUMENT to root', () => {
    const graph = new Map<string, DepGraphNode>();
    const doc = toSpdx(makeScan([], graph), { documentId: 'x' });
    expect(doc.relationships[0]).toMatchObject({
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
    });
  });

  it('includes package externalRefs with purl', () => {
    const pkg = makePkg('serde', '1.0.0', 'MIT OR Apache-2.0', { ecosystem: 'cargo' });
    const graph = new Map([[pkgKey(pkg.name, pkg.version), makeNode(pkg, 1)]]);
    const doc = toSpdx(makeScan([pkg], graph), { documentId: 'x' });

    const serdePackage = doc.packages.find((p) => p.name === 'serde')!;
    expect(serdePackage.externalRefs).toEqual([
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: 'pkg:cargo/serde@1.0.0',
      },
    ]);
    expect(serdePackage.licenseConcluded).toBe('MIT OR Apache-2.0');
    expect(serdePackage.licenseDeclared).toBe('MIT OR Apache-2.0');
  });

  it('uses NOASSERTION when license is unknown', () => {
    const pkg = makePkg('mystery', '1.0.0', null);
    const graph = new Map([[pkgKey(pkg.name, pkg.version), makeNode(pkg, 1)]]);
    const doc = toSpdx(makeScan([pkg], graph), { documentId: 'x' });

    const mystery = doc.packages.find((p) => p.name === 'mystery')!;
    expect(mystery.licenseConcluded).toBe('NOASSERTION');
    expect(mystery.licenseDeclared).toBe('NOASSERTION');
  });

  it('emits DEPENDS_ON relationships from root to depth-1 packages', () => {
    const a = makePkg('a', '1.0.0', 'MIT');
    const graph = new Map([[pkgKey(a.name, a.version), makeNode(a, 1)]]);
    const doc = toSpdx(makeScan([a], graph), { documentId: 'x' });

    const depends = doc.relationships.filter((r) => r.relationshipType === 'DEPENDS_ON');
    expect(depends).toHaveLength(1);
    expect(depends[0]!.relatedSpdxElement).toBe('SPDXRef-Package-a-1.0.0');
  });

  it('generates SPDX-valid IDs by replacing disallowed chars', () => {
    const pkg = makePkg('@scope/name', '1.0.0-beta+build.1', 'MIT');
    const graph = new Map([[pkgKey(pkg.name, pkg.version), makeNode(pkg, 1)]]);
    const doc = toSpdx(makeScan([pkg], graph), { documentId: 'x' });

    const entry = doc.packages.find((p) => p.name === '@scope/name')!;
    // No @, /, or + allowed in SPDX IDs; allowed chars are A-Z a-z 0-9 . -
    expect(entry.SPDXID).toMatch(/^SPDXRef-Package-[A-Za-z0-9.-]+$/);
  });
});
