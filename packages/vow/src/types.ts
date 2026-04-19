export type LicenseSource =
  | 'package-metadata'
  | 'spdx-expression'
  | 'license-file'
  | 'classifier'
  | 'registry-api'
  | 'ai-fallback'
  | 'none';

export type LicenseCategory =
  | 'permissive'
  | 'weakly-copyleft'
  | 'strongly-copyleft'
  | 'network-copyleft'
  | 'public-domain'
  | 'proprietary'
  | 'unknown'
  | 'custom';

export type DependencyType = 'production' | 'dev' | 'peer' | 'optional';

export interface LicenseResult {
  spdxExpression: string | null;
  source: LicenseSource;
  confidence: number;
  category: LicenseCategory;
  licenseFilePath?: string;
  licenseText?: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  license: LicenseResult;
  dependencyType: DependencyType;
  path?: string;
  rawLicense?: string;
  /** Source ecosystem: 'npm', 'cargo', 'pip'. Used for PURL generation in SBOM. */
  ecosystem?: string;
}

export interface DepGraphNode {
  pkg: PackageInfo;
  dependencies: Map<string, string>;
  dependents: Map<string, string>;
  depth: number;
}

export interface LicenseSummary {
  total: number;
  byLicense: Map<string, number>;
  byCategory: Map<string, number>;
  unknown: number;
  custom: number;
}

export interface WorkspaceSummary {
  name: string;
  path: string;
  directDependencies: string[];
}

export interface ScanResult {
  timestamp: string;
  project: { name: string; version: string; path: string };
  packages: PackageInfo[];
  graph: Map<string, DepGraphNode>;
  summary: LicenseSummary;
  ecosystems: string[];
  workspaces: WorkspaceSummary[];
}

export interface ScanResultJSON {
  timestamp: string;
  project: { name: string; version: string; path: string };
  packages: PackageInfo[];
  graph: Record<string, {
    pkg: PackageInfo;
    dependencies: Record<string, string>;
    dependents: Record<string, string>;
    depth: number;
  }>;
  summary: {
    total: number;
    byLicense: Record<string, number>;
    byCategory: Record<string, number>;
    unknown: number;
    custom: number;
  };
  ecosystems: string[];
  workspaces: WorkspaceSummary[];
}

export function pkgKey(name: string, version: string): string {
  return `${name}@${version}`;
}

export function scanResultToJSON(result: ScanResult): ScanResultJSON {
  const graph: ScanResultJSON['graph'] = {};
  for (const [key, node] of result.graph) {
    graph[key] = {
      pkg: node.pkg,
      dependencies: Object.fromEntries(node.dependencies),
      dependents: Object.fromEntries(node.dependents),
      depth: node.depth,
    };
  }

  return {
    timestamp: result.timestamp,
    project: result.project,
    packages: result.packages,
    graph,
    summary: {
      total: result.summary.total,
      byLicense: Object.fromEntries(result.summary.byLicense),
      byCategory: Object.fromEntries(result.summary.byCategory),
      unknown: result.summary.unknown,
      custom: result.summary.custom,
    },
    ecosystems: result.ecosystems,
    workspaces: result.workspaces,
  };
}
