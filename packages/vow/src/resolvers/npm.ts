import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { BaseResolver, type ResolvedPackage, type ResolverOptions } from './base.js';
import type { DependencyType } from '../types.js';
import { pkgKey } from '../types.js';

interface LockfilePackageEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
  peer?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  license?: string | { type: string; url?: string };
  link?: boolean;
}

interface PackageLockV2 {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, LockfilePackageEntry>;
  dependencies?: Record<string, LockfileV1Entry>;
}

interface LockfileV1Entry {
  version: string;
  resolved?: string;
  dev?: boolean;
  optional?: boolean;
  dependencies?: Record<string, LockfileV1Entry>;
  requires?: Record<string, string>;
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

const BATCH_SIZE = 50;

export class NpmResolver extends BaseResolver {
  private lockfilePath: string = '';
  private rootPkgJson: PkgJson = {};

  constructor(options: ResolverOptions) {
    super(options);
  }

  get ecosystem(): string {
    return 'npm';
  }

  async detect(): Promise<boolean> {
    const candidates = ['package-lock.json', 'npm-shrinkwrap.json'];
    for (const file of candidates) {
      const filePath = path.join(this.options.projectPath, file);
      try {
        await access(filePath);
        this.lockfilePath = filePath;
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  async resolve(): Promise<ResolvedPackage[]> {
    if (!this.lockfilePath) {
      const detected = await this.detect();
      if (!detected) return [];
    }

    // Read root package.json
    try {
      const rootPkgPath = path.join(this.options.projectPath, 'package.json');
      const rootPkgContent = await readFile(rootPkgPath, 'utf-8');
      this.rootPkgJson = JSON.parse(rootPkgContent) as PkgJson;
    } catch {
      this.rootPkgJson = {};
    }

    // Read lockfile
    const lockContent = await readFile(this.lockfilePath, 'utf-8');
    const lockfile = JSON.parse(lockContent) as PackageLockV2;

    const lockVersion = lockfile.lockfileVersion ?? 1;

    if (lockVersion >= 2 && lockfile.packages) {
      return this.resolveFromV2(lockfile);
    } else if (lockfile.dependencies) {
      return this.resolveFromV1(lockfile);
    }

    return [];
  }

  private async resolveFromV2(lockfile: PackageLockV2): Promise<ResolvedPackage[]> {
    const packages = lockfile.packages!;
    const entries: Array<{
      name: string;
      version: string;
      depType: DependencyType;
      depPath: string;
      entry: LockfilePackageEntry;
    }> = [];

    // Build set of root dev dependencies for classification
    const rootDevDeps = new Set(Object.keys(this.rootPkgJson.devDependencies ?? {}));
    const rootPeerDeps = new Set(Object.keys(this.rootPkgJson.peerDependencies ?? {}));
    const rootOptionalDeps = new Set(Object.keys(this.rootPkgJson.optionalDependencies ?? {}));

    for (const [pkgPath, entry] of Object.entries(packages)) {
      // Skip root package entry (empty string key)
      if (pkgPath === '') continue;

      // Skip workspace links
      if (entry.link) continue;

      // Extract package name from path
      const name = this.extractPackageName(pkgPath);
      if (!name) continue;

      const version = entry.version ?? '0.0.0';

      // Determine dependency type
      let depType: DependencyType = 'production';
      if (entry.dev) {
        depType = 'dev';
      } else if (entry.optional) {
        depType = 'optional';
      } else if (entry.peer) {
        depType = 'peer';
      } else if (rootDevDeps.has(name)) {
        depType = 'dev';
      } else if (rootPeerDeps.has(name)) {
        depType = 'peer';
      } else if (rootOptionalDeps.has(name)) {
        depType = 'optional';
      }

      // Skip dev dependencies if not included
      if (!this.options.includeDevDependencies && depType === 'dev') continue;

      entries.push({ name, version, depType, depPath: pkgPath, entry });
    }

    // Resolve licenses in batches
    const resolved: ResolvedPackage[] = [];
    const licenseCache = new Map<string, ResolvedPackage>();

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async ({ name, version, depType, depPath, entry }) => {
          const key = pkgKey(name, version);

          // Check cache
          const cached = licenseCache.get(key);
          if (cached) {
            return { ...cached, dependencyType: depType };
          }

          // Build the actual filesystem path
          const pkgDir = path.join(this.options.projectPath, depPath);

          // Try to read package.json from node_modules
          let metadata: Record<string, unknown> = {};
          try {
            const pkgJsonPath = path.join(pkgDir, 'package.json');
            const content = await readFile(pkgJsonPath, 'utf-8');
            metadata = JSON.parse(content) as Record<string, unknown>;
          } catch {
            // Use lockfile license data if available
            if (entry.license) {
              metadata = { license: entry.license };
            }
          }

          // Collect dependencies
          const deps = [
            ...Object.keys(entry.dependencies ?? {}),
            ...Object.keys(entry.peerDependencies ?? {}),
            ...Object.keys(entry.optionalDependencies ?? {}),
          ];

          const license = await this.resolveLicense(name, version, pkgDir, metadata);

          const rawLicense = typeof metadata['license'] === 'string'
            ? metadata['license']
            : typeof metadata['license'] === 'object' && metadata['license'] !== null
              ? (metadata['license'] as { type?: string }).type
              : undefined;

          const result: ResolvedPackage = {
            name,
            version,
            license,
            dependencyType: depType,
            dependencies: deps.map(d => d), // just names for now; resolved later in graph building
            path: pkgDir,
            rawLicense: rawLicense ?? undefined,
          };

          licenseCache.set(key, result);
          return result;
        }),
      );

      resolved.push(...batchResults);
    }

    return resolved;
  }

  private async resolveFromV1(lockfile: PackageLockV2): Promise<ResolvedPackage[]> {
    const resolved: ResolvedPackage[] = [];
    const visited = new Set<string>();

    const walk = async (
      deps: Record<string, LockfileV1Entry>,
      parentPath: string,
      isDev: boolean,
    ): Promise<void> => {
      for (const [name, entry] of Object.entries(deps)) {
        const key = pkgKey(name, entry.version);
        if (visited.has(key)) continue;
        visited.add(key);

        const depType: DependencyType = (entry.dev || isDev) ? 'dev' : entry.optional ? 'optional' : 'production';

        if (!this.options.includeDevDependencies && depType === 'dev') continue;

        const pkgDir = path.join(parentPath, 'node_modules', name);

        let metadata: Record<string, unknown> = {};
        try {
          const content = await readFile(path.join(pkgDir, 'package.json'), 'utf-8');
          metadata = JSON.parse(content) as Record<string, unknown>;
        } catch {
          // fallback: no metadata
        }

        const license = await this.resolveLicense(name, entry.version, pkgDir, metadata);

        const rawLicense = typeof metadata['license'] === 'string'
          ? metadata['license']
          : undefined;

        resolved.push({
          name,
          version: entry.version,
          license,
          dependencyType: depType,
          dependencies: Object.keys(entry.requires ?? {}),
          path: pkgDir,
          rawLicense,
        });

        // Recurse into nested dependencies
        if (entry.dependencies) {
          await walk(entry.dependencies, pkgDir, isDev || !!entry.dev);
        }
      }
    };

    if (lockfile.dependencies) {
      // Determine which top-level deps are dev
      const rootDevDeps = new Set(Object.keys(this.rootPkgJson.devDependencies ?? {}));

      await walk(lockfile.dependencies, this.options.projectPath, false);

      // Mark dev deps
      for (const pkg of resolved) {
        if (rootDevDeps.has(pkg.name) && pkg.dependencyType === 'production') {
          pkg.dependencyType = 'dev';
        }
      }
    }

    return resolved;
  }

  private extractPackageName(pkgPath: string): string | null {
    // V2/V3 format: "node_modules/@scope/name" or "node_modules/name"
    // Also handles nested: "node_modules/a/node_modules/b"
    const parts = pkgPath.split('node_modules/');
    const last = parts[parts.length - 1];
    if (!last) return null;
    // Remove trailing slashes
    return last.replace(/\/$/, '');
  }
}
