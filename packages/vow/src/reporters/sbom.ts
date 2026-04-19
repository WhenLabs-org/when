import { randomUUID, createHash } from 'node:crypto';
import type { PackageInfo, ScanResult } from '../types.js';
import { pkgKey } from '../types.js';

export interface SbomOptions {
  /** Override timestamp (used by tests for deterministic snapshots). */
  now?: Date;
  /** Override UUID for documentNamespace / serialNumber (used by tests). */
  documentId?: string;
  /** Tool version string to embed in metadata. */
  toolVersion?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Purl helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a Package URL (https://github.com/package-url/purl-spec) for a
 * resolved package. Ecosystem mapping matches the purl-spec's official
 * type names.
 */
export function purlFor(pkg: PackageInfo): string {
  const ecosystem = pkg.ecosystem ?? 'npm';
  const type = ecosystemToPurlType(ecosystem);
  const version = encodeURIComponent(pkg.version);

  if (pkg.name.startsWith('@')) {
    // Scoped npm packages: "@scope/name" -> "@scope/name" with scope url-encoded
    const slashIdx = pkg.name.indexOf('/');
    if (slashIdx > 0) {
      const scope = pkg.name.slice(0, slashIdx);
      const name = pkg.name.slice(slashIdx + 1);
      return `pkg:${type}/${encodeURIComponent(scope)}/${encodeURIComponent(name)}@${version}`;
    }
  }

  return `pkg:${type}/${encodeURIComponent(pkg.name)}@${version}`;
}

function ecosystemToPurlType(ecosystem: string): string {
  switch (ecosystem) {
    case 'npm':
      return 'npm';
    case 'cargo':
      return 'cargo';
    case 'pip':
      return 'pypi';
    default:
      return ecosystem;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CycloneDX 1.5 JSON
// ─────────────────────────────────────────────────────────────────────────────

export interface CycloneDxBom {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{ vendor: string; name: string; version?: string }>;
    component: {
      type: 'application';
      name: string;
      version: string;
      'bom-ref': string;
    };
  };
  components: CycloneDxComponent[];
  dependencies: Array<{ ref: string; dependsOn?: string[] }>;
}

interface CycloneDxComponent {
  type: 'library';
  'bom-ref': string;
  name: string;
  version: string;
  purl: string;
  scope?: 'required' | 'optional' | 'excluded';
  licenses?: Array<
    | { license: { id: string } }
    | { license: { name: string } }
    | { expression: string }
  >;
}

export function toCycloneDx(result: ScanResult, options: SbomOptions = {}): CycloneDxBom {
  const now = options.now ?? new Date();
  const docId = options.documentId ?? randomUUID();
  const rootRef = `${result.project.name}@${result.project.version}`;

  const components: CycloneDxComponent[] = result.packages.map((pkg) => {
    const ref = purlFor(pkg);
    const component: CycloneDxComponent = {
      type: 'library',
      'bom-ref': ref,
      name: pkg.name,
      version: pkg.version,
      purl: ref,
    };
    if (pkg.dependencyType === 'optional') component.scope = 'optional';
    const licenses = toCycloneDxLicenses(pkg);
    if (licenses) component.licenses = licenses;
    return component;
  });

  const dependencies: CycloneDxBom['dependencies'] = [];
  const rootChildren: string[] = [];
  for (const pkg of result.packages) {
    const node = result.graph.get(pkgKey(pkg.name, pkg.version));
    const ref = purlFor(pkg);
    if (node && node.depth === 1) rootChildren.push(ref);
    if (node && node.dependencies.size > 0) {
      dependencies.push({
        ref,
        dependsOn: [...node.dependencies.entries()].map(([name, version]) =>
          purlFor({ ...pkg, name, version }),
        ),
      });
    } else {
      dependencies.push({ ref });
    }
  }
  dependencies.unshift({ ref: rootRef, dependsOn: rootChildren });

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${docId}`,
    version: 1,
    metadata: {
      timestamp: now.toISOString(),
      tools: [
        { vendor: 'WhenLabs', name: 'vow', version: options.toolVersion },
      ],
      component: {
        type: 'application',
        name: result.project.name,
        version: result.project.version,
        'bom-ref': rootRef,
      },
    },
    components,
    dependencies,
  };
}

function toCycloneDxLicenses(pkg: PackageInfo): CycloneDxComponent['licenses'] | undefined {
  const expr = pkg.license.spdxExpression;
  if (!expr) return undefined;

  // Compound expressions (containing OR/AND/WITH) use the `expression` form.
  if (/\s(OR|AND|WITH)\s/i.test(expr)) {
    return [{ expression: expr }];
  }
  // Simple SPDX ID.
  return [{ license: { id: expr } }];
}

// ─────────────────────────────────────────────────────────────────────────────
// SPDX 2.3 JSON
// ─────────────────────────────────────────────────────────────────────────────

export interface SpdxDocument {
  spdxVersion: 'SPDX-2.3';
  dataLicense: 'CC0-1.0';
  SPDXID: 'SPDXRef-DOCUMENT';
  name: string;
  documentNamespace: string;
  creationInfo: {
    created: string;
    creators: string[];
  };
  packages: SpdxPackage[];
  relationships: Array<{
    spdxElementId: string;
    relationshipType: string;
    relatedSpdxElement: string;
  }>;
}

interface SpdxPackage {
  SPDXID: string;
  name: string;
  versionInfo: string;
  downloadLocation: string;
  filesAnalyzed: boolean;
  licenseConcluded: string;
  licenseDeclared: string;
  externalRefs?: Array<{
    referenceCategory: 'PACKAGE-MANAGER';
    referenceType: 'purl';
    referenceLocator: string;
  }>;
}

/**
 * SPDX IDs must match `SPDXRef-[A-Za-z0-9.-]+`. We hash anything else to a
 * short, deterministic suffix to stay under the 40-char SPDX ID soft limit
 * while preserving readability for the common case.
 */
function spdxIdFor(pkg: PackageInfo): string {
  const clean = `${pkg.name}-${pkg.version}`.replace(/[^A-Za-z0-9.-]/g, '-');
  if (clean.length <= 60) return `SPDXRef-Package-${clean}`;
  const hash = createHash('sha1').update(`${pkg.name}@${pkg.version}`).digest('hex').slice(0, 12);
  return `SPDXRef-Package-${hash}`;
}

function spdxLicenseValue(pkg: PackageInfo): string {
  const expr = pkg.license.spdxExpression;
  if (!expr) return 'NOASSERTION';
  return expr;
}

export function toSpdx(result: ScanResult, options: SbomOptions = {}): SpdxDocument {
  const now = options.now ?? new Date();
  const docId = options.documentId ?? randomUUID();
  const rootSpdxId = spdxIdFor({
    name: result.project.name,
    version: result.project.version,
    license: { spdxExpression: null, source: 'none', confidence: 0, category: 'unknown' },
    dependencyType: 'production',
  });

  const packages: SpdxPackage[] = [
    {
      SPDXID: rootSpdxId,
      name: result.project.name,
      versionInfo: result.project.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NOASSERTION',
    },
    ...result.packages.map<SpdxPackage>((pkg) => ({
      SPDXID: spdxIdFor(pkg),
      name: pkg.name,
      versionInfo: pkg.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: spdxLicenseValue(pkg),
      licenseDeclared: spdxLicenseValue(pkg),
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: purlFor(pkg),
        },
      ],
    })),
  ];

  const relationships: SpdxDocument['relationships'] = [
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: rootSpdxId,
    },
  ];

  for (const pkg of result.packages) {
    const node = result.graph.get(pkgKey(pkg.name, pkg.version));
    if (!node) continue;
    if (node.depth === 1) {
      relationships.push({
        spdxElementId: rootSpdxId,
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: spdxIdFor(pkg),
      });
    }
    for (const [depName, depVersion] of node.dependencies) {
      relationships.push({
        spdxElementId: spdxIdFor(pkg),
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: spdxIdFor({
          ...pkg,
          name: depName,
          version: depVersion,
        }),
      });
    }
  }

  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${result.project.name}-${result.project.version}`,
    documentNamespace: `https://whenlabs.org/vow/spdx/${docId}`,
    creationInfo: {
      created: now.toISOString(),
      creators: [options.toolVersion ? `Tool: vow-${options.toolVersion}` : 'Tool: vow'],
    },
    packages,
    relationships,
  };
}
