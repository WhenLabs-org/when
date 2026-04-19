import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { BaseResolver, type ResolvedPackage, type ResolverOptions } from './base.js';
import type { DependencyType, LicenseResult } from '../types.js';
import { parsePoetryLock } from './poetry-lock.js';
import type { PyPIRegistryClient } from './pypi-registry.js';
import type { LicenseCache } from './license-cache.js';
import { pLimit } from '../util/p-limit.js';

const DEFAULT_CONCURRENCY = 32;

export class PipResolver extends BaseResolver {
  private lockfilePath = '';
  private readonly registryClient?: PyPIRegistryClient;
  private readonly licenseCache?: LicenseCache;

  constructor(
    options: ResolverOptions,
    registryClient?: PyPIRegistryClient,
    licenseCache?: LicenseCache,
  ) {
    super(options);
    this.registryClient = registryClient;
    this.licenseCache = licenseCache;
  }

  get ecosystem(): string {
    return 'pip';
  }

  async detect(): Promise<boolean> {
    const filePath = path.join(this.options.projectPath, 'poetry.lock');
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
    const entries = parsePoetryLock(content);

    const limit = pLimit(DEFAULT_CONCURRENCY);
    const tasks = entries.map((pkg) =>
      limit(async () => {
        const license = await this.resolvePyPILicense(pkg.name, pkg.version);
        // category='dev' (pre-1.5 poetry) or groups.dev (1.5+) → 'dev' so
        // --production filters it out. optional=true is a separate axis for
        // poetry "extras". Modern poetry.lock files omit category entirely;
        // dev/optional detection will need [package.source.reference] or
        // pyproject.toml group parsing in a follow-up.
        const depType: DependencyType =
          pkg.category === 'dev' ? 'dev' : pkg.optional ? 'optional' : 'production';
        const result: ResolvedPackage = {
          name: pkg.name,
          version: pkg.version,
          license,
          dependencyType: depType,
          dependencies: pkg.dependencies,
        };
        return result;
      }),
    );

    return Promise.all(tasks);
  }

  private async resolvePyPILicense(name: string, version: string): Promise<LicenseResult> {
    if (this.licenseCache) {
      const cached = await this.licenseCache.get('pip', name, version);
      if (cached) return cached;
    }

    const resolved = await this.resolvePyPILicenseUncached(name, version);
    if (this.licenseCache) {
      await this.licenseCache.set('pip', name, version, resolved);
    }
    return resolved;
  }

  private async resolvePyPILicenseUncached(
    name: string,
    version: string,
  ): Promise<LicenseResult> {
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
