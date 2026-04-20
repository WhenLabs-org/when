import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { BaseResolver, type ResolvedPackage, type ResolverOptions } from './base.js';
import type { DependencyType, LicenseResult } from '../types.js';
import { pkgKey } from '../types.js';
import type { NpmRegistryClient } from './registry.js';
import type { LicenseCache } from './license-cache.js';
import { pLimit } from '../util/p-limit.js';

// pnpm-lock.yaml is YAML but the shapes we care about are stable enough to
// model loosely — we only read a few keys out of the `importers` and
// `packages` blocks.

interface PnpmImporter {
  dependencies?: Record<string, PnpmDepSpec | string>;
  devDependencies?: Record<string, PnpmDepSpec | string>;
  peerDependencies?: Record<string, PnpmDepSpec | string>;
  optionalDependencies?: Record<string, PnpmDepSpec | string>;
}

interface PnpmDepSpec {
  specifier?: string;
  version?: string;
}

interface PnpmPackageEntry {
  resolution?: { integrity?: string; tarball?: string };
  dev?: boolean;
  optional?: boolean;
  peer?: boolean;
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  // v9 sometimes puts license info here; usually absent.
  license?: string;
}

interface PnpmLockfile {
  lockfileVersion?: string | number;
  importers?: Record<string, PnpmImporter>;
  // v6-: `packages` has license-ish metadata; v9: split between `packages`
  // (metadata) and `snapshots` (edges). We don't need the edges.
  packages?: Record<string, PnpmPackageEntry>;
}

interface PkgJson {
  name?: string;
  version?: string;
  license?: string | { type: string; url?: string };
  licenses?: Array<{ type: string; url?: string }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const DEFAULT_CONCURRENCY = 32;

// Parse a pnpm package key like:
//   /foo@1.2.3                 -> { name: 'foo', version: '1.2.3' }
//   /@scope/bar@2.0.0          -> { name: '@scope/bar', version: '2.0.0' }
//   foo@1.2.3                  -> { name: 'foo', version: '1.2.3' }    (v9)
//   foo@1.2.3(peer@1.0.0)      -> peer-adjusted key; strip the suffix
export function parsePnpmPkgKey(key: string): { name: string; version: string } | null {
  const trimmed = key.startsWith('/') ? key.slice(1) : key;
  // Strip peer-adjustment suffix `(...)` that pnpm appends to some keys.
  const cleaned = trimmed.replace(/\([^)]*\)/g, '');
  const at = cleaned.lastIndexOf('@');
  if (at <= 0) return null;
  const name = cleaned.slice(0, at);
  const version = cleaned.slice(at + 1);
  if (!name || !version) return null;
  return { name, version };
}

export class PnpmResolver extends BaseResolver {
  private lockfilePath: string = '';
  private rootPkgJson: PkgJson = {};
  private readonly registryClient?: NpmRegistryClient;
  private readonly licenseCache?: LicenseCache;

  constructor(
    options: ResolverOptions,
    registryClient?: NpmRegistryClient,
    licenseCache?: LicenseCache,
  ) {
    super(options);
    this.registryClient = registryClient;
    this.licenseCache = licenseCache;
  }

  get ecosystem(): string {
    return 'pnpm';
  }

  async detect(): Promise<boolean> {
    const candidate = path.join(this.options.projectPath, 'pnpm-lock.yaml');
    try {
      await access(candidate);
      this.lockfilePath = candidate;
      return true;
    } catch {
      return false;
    }
  }

  async resolve(): Promise<ResolvedPackage[]> {
    if (!this.lockfilePath) {
      const detected = await this.detect();
      if (!detected) return [];
    }

    try {
      const rootPkgPath = path.join(this.options.projectPath, 'package.json');
      const rootPkgContent = await readFile(rootPkgPath, 'utf-8');
      this.rootPkgJson = JSON.parse(rootPkgContent) as PkgJson;
    } catch {
      this.rootPkgJson = {};
    }

    const lockContent = await readFile(this.lockfilePath, 'utf-8');
    const lockfile = parseYaml(lockContent) as PnpmLockfile;
    if (!lockfile?.packages) return [];

    const rootDevDeps = new Set(Object.keys(this.rootPkgJson.devDependencies ?? {}));
    const rootPeerDeps = new Set(Object.keys(this.rootPkgJson.peerDependencies ?? {}));
    const rootOptionalDeps = new Set(
      Object.keys(this.rootPkgJson.optionalDependencies ?? {}),
    );

    interface Entry {
      name: string;
      version: string;
      depType: DependencyType;
      entry: PnpmPackageEntry;
    }

    const entries: Entry[] = [];
    const seen = new Set<string>();

    for (const [key, entry] of Object.entries(lockfile.packages)) {
      const parsed = parsePnpmPkgKey(key);
      if (!parsed) continue;
      const { name, version } = parsed;
      const dedupe = `${name}@${version}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      let depType: DependencyType = 'production';
      if (entry.dev) depType = 'dev';
      else if (entry.optional) depType = 'optional';
      else if (entry.peer) depType = 'peer';
      else if (rootDevDeps.has(name)) depType = 'dev';
      else if (rootPeerDeps.has(name)) depType = 'peer';
      else if (rootOptionalDeps.has(name)) depType = 'optional';

      if (!this.options.includeDevDependencies && depType === 'dev') continue;

      entries.push({ name, version, depType, entry });
    }

    const limit = pLimit(DEFAULT_CONCURRENCY);
    const perVersion = new Map<string, ResolvedPackage>();

    const tasks = entries.map(({ name, version, depType, entry }) =>
      limit(async () => {
        const key = pkgKey(name, version);
        const cached = perVersion.get(key);
        if (cached) return { ...cached, dependencyType: depType };

        // pnpm installs packages to node_modules/.pnpm/<scope+name>@<version>
        // /node_modules/<name>/package.json. Scoped packages use `+` in place
        // of `/` at the outer level.
        const pnpmDirName = `${name.replace(/\//g, '+')}@${version}`;
        const pkgDir = path.join(
          this.options.projectPath,
          'node_modules',
          '.pnpm',
          pnpmDirName,
          'node_modules',
          name,
        );

        let metadata: Record<string, unknown> = {};
        try {
          const content = await readFile(path.join(pkgDir, 'package.json'), 'utf-8');
          metadata = JSON.parse(content) as Record<string, unknown>;
        } catch {
          if (entry.license) metadata = { license: entry.license };
        }

        const deps = [
          ...Object.keys(entry.dependencies ?? {}),
          ...Object.keys(entry.peerDependencies ?? {}),
          ...Object.keys(entry.optionalDependencies ?? {}),
        ];

        const license = await this.resolveLicense(name, version, pkgDir, metadata);

        const rawLicense =
          typeof metadata['license'] === 'string'
            ? (metadata['license'] as string)
            : typeof metadata['license'] === 'object' && metadata['license'] !== null
              ? (metadata['license'] as { type?: string }).type
              : undefined;

        const result: ResolvedPackage = {
          name,
          version,
          license,
          dependencyType: depType,
          dependencies: deps,
          path: pkgDir,
          rawLicense: rawLicense ?? undefined,
        };

        perVersion.set(key, result);
        return result;
      }),
    );

    return Promise.all(tasks);
  }

  protected override async resolveLicense(
    name: string,
    version: string,
    packageDir?: string,
    metadata?: Record<string, unknown>,
  ): Promise<LicenseResult> {
    if (this.licenseCache) {
      const cached = await this.licenseCache.get('npm', name, version);
      if (cached) return cached;
    }

    const baseResult = await super.resolveLicense(name, version, packageDir, metadata);
    let resolved = baseResult;
    if (baseResult.source === 'none' && this.registryClient) {
      const registryLicense = await this.registryClient.getLicense(name, version);
      if (registryLicense) {
        const fromRegistry = this.extractLicenseFromMetadata({ license: registryLicense });
        if (fromRegistry && fromRegistry.spdxExpression) {
          resolved = { ...fromRegistry, source: 'registry-api' };
        }
      }
    }

    if (this.licenseCache) {
      await this.licenseCache.set('npm', name, version, resolved);
    }
    return resolved;
  }
}
