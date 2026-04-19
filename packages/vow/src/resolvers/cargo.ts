import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { BaseResolver, type ResolvedPackage, type ResolverOptions } from './base.js';
import type { LicenseResult } from '../types.js';
import { parseCargoLock, parseDependencyName } from './cargo-lock.js';
import type { CratesRegistryClient } from './crates-registry.js';
import type { LicenseCache } from './license-cache.js';
import { pLimit } from '../util/p-limit.js';

const DEFAULT_CONCURRENCY = 32;

export class CargoResolver extends BaseResolver {
  private lockfilePath = '';
  private readonly registryClient?: CratesRegistryClient;
  private readonly licenseCache?: LicenseCache;

  constructor(
    options: ResolverOptions,
    registryClient?: CratesRegistryClient,
    licenseCache?: LicenseCache,
  ) {
    super(options);
    this.registryClient = registryClient;
    this.licenseCache = licenseCache;
  }

  get ecosystem(): string {
    return 'cargo';
  }

  async detect(): Promise<boolean> {
    const filePath = path.join(this.options.projectPath, 'Cargo.lock');
    try {
      await access(filePath);
      this.lockfilePath = filePath;
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

    const content = await readFile(this.lockfilePath, 'utf-8');
    const entries = parseCargoLock(content);

    // Skip packages with no source since those are local path/workspace
    // crates (the root crate itself, path = "../foo" deps, etc.) and
    // shouldn't be license-audited.
    //
    // Cargo.lock doesn't distinguish dev-dependencies from regular deps at
    // the lockfile level (that axis lives in Cargo.toml), so every external
    // crate resolves as 'production' for now. The graph-depth classification
    // (direct vs transitive) is derived from the dependency edges captured
    // in `pkg.dependencies` below and handled by buildGraph.
    const external = entries.filter((e) => e.source);

    const limit = pLimit(DEFAULT_CONCURRENCY);
    const tasks = external.map((pkg) =>
      limit(async () => {
        const license = await this.resolveCrateLicense(pkg.name, pkg.version);
        const result: ResolvedPackage = {
          name: pkg.name,
          version: pkg.version,
          license,
          dependencyType: 'production',
          dependencies: pkg.dependencies.map(parseDependencyName),
        };
        return result;
      }),
    );

    return Promise.all(tasks);
  }

  private async resolveCrateLicense(name: string, version: string): Promise<LicenseResult> {
    if (this.licenseCache) {
      const cached = await this.licenseCache.get('cargo', name, version);
      if (cached) return cached;
    }

    const resolved = await this.resolveCrateLicenseUncached(name, version);
    if (this.licenseCache) {
      await this.licenseCache.set('cargo', name, version, resolved);
    }
    return resolved;
  }

  private async resolveCrateLicenseUncached(
    name: string,
    version: string,
  ): Promise<LicenseResult> {
    // Cargo.lock carries no license metadata, so step 1-4 (package-dir based)
    // of the base chain all no-op here. Jump straight to the registry.
    if (!this.registryClient) {
      return {
        spdxExpression: null,
        source: 'none',
        confidence: 0,
        category: 'unknown',
      };
    }

    const raw = await this.registryClient.getLicense(name, version);
    if (!raw) {
      return {
        spdxExpression: null,
        source: 'none',
        confidence: 0,
        category: 'unknown',
      };
    }

    const fromMeta = this.extractLicenseFromMetadata({ license: raw });
    if (fromMeta) {
      return { ...fromMeta, source: 'registry-api' };
    }
    return {
      spdxExpression: null,
      source: 'registry-api',
      confidence: 0,
      category: 'custom',
      licenseText: raw,
    };
  }
}
