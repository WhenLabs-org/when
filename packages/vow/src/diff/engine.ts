import type { LicenseCategory, PackageInfo, ScanResult, ScanResultJSON } from '../types.js';

export type DiffSeverity = 'info' | 'warning' | 'error';

export interface DiffAddition {
  kind: 'added';
  severity: DiffSeverity;
  name: string;
  ecosystem?: string;
  newVersion: string;
  newLicense: string;
  newCategory: LicenseCategory;
}

export interface DiffRemoval {
  kind: 'removed';
  severity: DiffSeverity;
  name: string;
  ecosystem?: string;
  oldVersion: string;
  oldLicense: string;
}

export interface DiffVersionChange {
  kind: 'version-changed';
  severity: DiffSeverity;
  name: string;
  ecosystem?: string;
  oldVersion: string;
  newVersion: string;
  oldLicense: string;
  newLicense: string;
  licenseChanged: boolean;
  oldCategory: LicenseCategory;
  newCategory: LicenseCategory;
}

export interface DiffLicenseChange {
  kind: 'license-changed';
  severity: DiffSeverity;
  name: string;
  ecosystem?: string;
  version: string;
  oldLicense: string;
  newLicense: string;
  oldCategory: LicenseCategory;
  newCategory: LicenseCategory;
}

export type DiffEntry =
  | DiffAddition
  | DiffRemoval
  | DiffVersionChange
  | DiffLicenseChange;

export interface DiffResult {
  baseline: { name: string; version: string };
  current: { name: string; version: string };
  added: DiffAddition[];
  removed: DiffRemoval[];
  versionChanged: DiffVersionChange[];
  licenseChanged: DiffLicenseChange[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
  };
}

/**
 * Category severity ranking. Higher = worse from a compliance perspective.
 * Unknown/custom are deliberately at the top since they represent "we
 * couldn't tell what this is."
 */
const CATEGORY_RANK: Record<LicenseCategory, number> = {
  'public-domain': 0,
  permissive: 1,
  'weakly-copyleft': 2,
  'strongly-copyleft': 3,
  'network-copyleft': 4,
  proprietary: 5,
  custom: 6,
  unknown: 7,
};

function categoryRank(cat: LicenseCategory): number {
  return CATEGORY_RANK[cat] ?? 0;
}

function licenseDowngradeSeverity(
  oldCat: LicenseCategory,
  newCat: LicenseCategory,
): DiffSeverity {
  const delta = categoryRank(newCat) - categoryRank(oldCat);
  if (delta <= 0) return 'info';
  if (delta === 1) return 'warning';
  return 'error';
}

function newDepSeverity(cat: LicenseCategory): DiffSeverity {
  // Introducing a strongly-copyleft or worse dep on a PR is an error. A new
  // permissive or weakly-copyleft dep is just info.
  const rank = categoryRank(cat);
  if (rank >= categoryRank('strongly-copyleft')) return 'error';
  if (rank >= categoryRank('weakly-copyleft')) return 'warning';
  return 'info';
}

interface PackageSnapshot {
  name: string;
  version: string;
  spdx: string;
  category: LicenseCategory;
  ecosystem?: string;
}

function packageKey(pkg: { name: string; ecosystem?: string }): string {
  return `${pkg.ecosystem ?? 'npm'}:${pkg.name}`;
}

function snapshotFromPackage(pkg: PackageInfo): PackageSnapshot {
  return {
    name: pkg.name,
    version: pkg.version,
    spdx: pkg.license.spdxExpression ?? 'UNKNOWN',
    category: pkg.license.category,
    ecosystem: pkg.ecosystem,
  };
}

/**
 * Compare a baseline scan (from disk) against a current scan. Both shapes
 * are accepted — live ScanResult (with Map graph) and serialized
 * ScanResultJSON (where graph is a plain object).
 */
export function diffScans(
  baseline: ScanResult | ScanResultJSON,
  current: ScanResult | ScanResultJSON,
): DiffResult {
  const baselineMap = new Map<string, PackageSnapshot>();
  for (const pkg of baseline.packages) {
    baselineMap.set(packageKey(pkg), snapshotFromPackage(pkg));
  }
  const currentMap = new Map<string, PackageSnapshot>();
  for (const pkg of current.packages) {
    currentMap.set(packageKey(pkg), snapshotFromPackage(pkg));
  }

  const added: DiffAddition[] = [];
  const removed: DiffRemoval[] = [];
  const versionChanged: DiffVersionChange[] = [];
  const licenseChanged: DiffLicenseChange[] = [];

  for (const [key, pkg] of currentMap) {
    const prev = baselineMap.get(key);
    if (!prev) {
      added.push({
        kind: 'added',
        severity: newDepSeverity(pkg.category),
        name: pkg.name,
        ecosystem: pkg.ecosystem,
        newVersion: pkg.version,
        newLicense: pkg.spdx,
        newCategory: pkg.category,
      });
      continue;
    }

    if (prev.version !== pkg.version) {
      const licenseChangedBit = prev.spdx !== pkg.spdx;
      const severity = licenseChangedBit
        ? licenseDowngradeSeverity(prev.category, pkg.category)
        : 'info';
      versionChanged.push({
        kind: 'version-changed',
        severity,
        name: pkg.name,
        ecosystem: pkg.ecosystem,
        oldVersion: prev.version,
        newVersion: pkg.version,
        oldLicense: prev.spdx,
        newLicense: pkg.spdx,
        licenseChanged: licenseChangedBit,
        oldCategory: prev.category,
        newCategory: pkg.category,
      });
      continue;
    }

    if (prev.spdx !== pkg.spdx) {
      licenseChanged.push({
        kind: 'license-changed',
        severity: licenseDowngradeSeverity(prev.category, pkg.category),
        name: pkg.name,
        ecosystem: pkg.ecosystem,
        version: pkg.version,
        oldLicense: prev.spdx,
        newLicense: pkg.spdx,
        oldCategory: prev.category,
        newCategory: pkg.category,
      });
    }
  }

  for (const [key, pkg] of baselineMap) {
    if (currentMap.has(key)) continue;
    removed.push({
      kind: 'removed',
      severity: 'info',
      name: pkg.name,
      ecosystem: pkg.ecosystem,
      oldVersion: pkg.version,
      oldLicense: pkg.spdx,
    });
  }

  const all: DiffEntry[] = [...added, ...removed, ...versionChanged, ...licenseChanged];
  const errors = all.filter((e) => e.severity === 'error').length;
  const warnings = all.filter((e) => e.severity === 'warning').length;
  const infos = all.filter((e) => e.severity === 'info').length;

  return {
    baseline: baseline.project,
    current: current.project,
    added,
    removed,
    versionChanged,
    licenseChanged,
    summary: {
      total: all.length,
      errors,
      warnings,
      infos,
    },
  };
}
