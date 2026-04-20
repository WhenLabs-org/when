import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ora from 'ora';
import type { ScanResult, LicenseSummary, PackageInfo } from '../types.js';
import { NpmResolver } from '../resolvers/npm.js';
import { PnpmResolver } from '../resolvers/pnpm.js';
import { discoverWorkspaces } from '../resolvers/workspaces.js';
import { NpmRegistryClient } from '../resolvers/registry.js';
import type { RegistryFetch } from '../resolvers/registry.js';
import { CargoResolver } from '../resolvers/cargo.js';
import { CratesRegistryClient } from '../resolvers/crates-registry.js';
import { PipResolver } from '../resolvers/pip.js';
import { PyPIRegistryClient } from '../resolvers/pypi-registry.js';
import { LicenseCache } from '../resolvers/license-cache.js';
import type { ResolvedPackage } from '../resolvers/base.js';
import { buildGraph } from '../graph/builder.js';
import type { DepGraph } from '../graph/builder.js';
import { reportScanSummary } from '../reporters/terminal.js';
import { toJSON } from '../reporters/json.js';
import { toCSV } from '../reporters/csv.js';
import { toMarkdown } from '../reporters/markdown.js';

export interface ScanOptions {
  path: string;
  depth?: number;
  production: boolean;
  format: string;
  output?: string;
  /** Enable registry API fallback for packages with no resolvable license. Defaults to true. */
  registry?: boolean;
  /** Inject a fetch implementation (used by tests). Shared by all registry clients. */
  registryFetch?: RegistryFetch;
  /** Enable cross-run license cache (~/.cache/vow/licenses/). Defaults to true. */
  licenseCache?: boolean;
}

export async function executeScan(opts: ScanOptions): Promise<ScanResult> {
  const projectPath = path.resolve(opts.path);

  // Read root package.json
  let rootName = 'unknown';
  let rootVersion = '0.0.0';
  const directDependencyNames = new Set<string>();
  try {
    const pkgJsonPath = path.join(projectPath, 'package.json');
    const content = await readFile(pkgJsonPath, 'utf-8');
    const pkgJson = JSON.parse(content) as {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    rootName = pkgJson.name ?? 'unknown';
    rootVersion = pkgJson.version ?? '0.0.0';
    for (const name of Object.keys(pkgJson.dependencies ?? {})) directDependencyNames.add(name);
    for (const name of Object.keys(pkgJson.devDependencies ?? {})) directDependencyNames.add(name);
    for (const name of Object.keys(pkgJson.peerDependencies ?? {})) directDependencyNames.add(name);
    for (const name of Object.keys(pkgJson.optionalDependencies ?? {})) directDependencyNames.add(name);
  } catch {
    // no package.json
  }

  const workspaces = await discoverWorkspaces(projectPath);
  for (const ws of workspaces) {
    for (const depName of ws.directDependencies) {
      directDependencyNames.add(depName);
    }
  }

  const spinner = ora('Scanning dependencies...').start();
  const ecosystems: string[] = [];

  const registryEnabled = opts.registry !== false;
  const licenseCacheEnabled = opts.licenseCache !== false;
  const npmRegistry = registryEnabled
    ? new NpmRegistryClient({ fetch: opts.registryFetch })
    : undefined;
  const cratesRegistry = registryEnabled
    ? new CratesRegistryClient({ fetch: opts.registryFetch })
    : undefined;
  const pypiRegistry = registryEnabled
    ? new PyPIRegistryClient({ fetch: opts.registryFetch })
    : undefined;
  const licenseCache = licenseCacheEnabled ? new LicenseCache() : undefined;

  const npmResolver = new NpmResolver(
    {
      projectPath,
      includeDevDependencies: !opts.production,
      depth: opts.depth,
    },
    npmRegistry,
    licenseCache,
  );

  const pnpmResolver = new PnpmResolver(
    {
      projectPath,
      includeDevDependencies: !opts.production,
      depth: opts.depth,
    },
    npmRegistry,
    licenseCache,
  );

  const cargoResolver = new CargoResolver(
    {
      projectPath,
      includeDevDependencies: !opts.production,
      depth: opts.depth,
    },
    cratesRegistry,
    licenseCache,
  );

  const pipResolver = new PipResolver(
    {
      projectPath,
      includeDevDependencies: !opts.production,
      depth: opts.depth,
    },
    pypiRegistry,
    licenseCache,
  );

  const allPackages: PackageInfo[] = [];
  const allResolved: ResolvedPackage[] = [];

  const collect = (ecosystem: string, resolved: ResolvedPackage[]) => {
    ecosystems.push(ecosystem);
    allResolved.push(...resolved);
    for (const pkg of resolved) {
      allPackages.push({
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        dependencyType: pkg.dependencyType,
        path: pkg.path,
        rawLicense: pkg.rawLicense,
        ecosystem,
      });
    }
  };

  if (await npmResolver.detect()) {
    spinner.text = `Scanning npm dependencies...`;
    collect('npm', await npmResolver.resolve());
  } else if (await pnpmResolver.detect()) {
    spinner.text = `Scanning pnpm dependencies...`;
    collect('pnpm', await pnpmResolver.resolve());
  }

  if (await cargoResolver.detect()) {
    spinner.text = `Scanning cargo dependencies...`;
    collect('cargo', await cargoResolver.resolve());
  }

  if (await pipResolver.detect()) {
    spinner.text = `Scanning pip dependencies...`;
    collect('pip', await pipResolver.resolve());
  }

  if (ecosystems.length === 0) {
    spinner.fail('No supported lockfile found');
    throw new Error(
      `No supported lockfile found in ${projectPath}. ` +
      `vow needs one of: package-lock.json, pnpm-lock.yaml, Cargo.lock, ` +
      `or a Python lockfile (requirements.txt with hashes, uv.lock, or poetry.lock). ` +
      `yarn.lock is not yet supported.`,
    );
  }

  spinner.text = `Resolved ${allPackages.length} packages. Building graph...`;
  const graph: DepGraph = buildGraph(
    allResolved,
    rootName,
    rootVersion,
    directDependencyNames,
  );

  // Compute summary
  const summary = computeSummary(allPackages);

  spinner.succeed(`Scanned ${allPackages.length} packages across ${ecosystems.join(', ') || 'no ecosystems'}`);

  const result: ScanResult = {
    timestamp: new Date().toISOString(),
    project: { name: rootName, version: rootVersion, path: projectPath },
    packages: allPackages,
    graph: graph.toJSON ? new Map(Object.entries(graph.toJSON()).map(([k, v]) => [k, {
      pkg: v.pkg,
      dependencies: new Map(Object.entries(v.dependencies)),
      dependents: new Map(Object.entries(v.dependents)),
      depth: v.depth,
    }])) : new Map(),
    summary,
    ecosystems,
    workspaces: workspaces.map((ws) => ({
      name: ws.name,
      path: ws.path,
      directDependencies: ws.directDependencies,
    })),
  };

  return result;
}

function computeSummary(packages: PackageInfo[]): LicenseSummary {
  const byLicense = new Map<string, number>();
  const byCategory = new Map<string, number>();
  let unknown = 0;
  let custom = 0;

  for (const pkg of packages) {
    const license = pkg.license.spdxExpression ?? 'UNKNOWN';
    byLicense.set(license, (byLicense.get(license) ?? 0) + 1);
    byCategory.set(pkg.license.category, (byCategory.get(pkg.license.category) ?? 0) + 1);

    if (pkg.license.category === 'unknown') unknown++;
    if (pkg.license.category === 'custom') custom++;
  }

  return {
    total: packages.length,
    byLicense,
    byCategory,
    unknown,
    custom,
  };
}

export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Scan dependencies and summarize licenses')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('-d, --depth <n>', 'Max dependency depth', parseInt)
    .option('--production', 'Skip devDependencies', false)
    .option('--no-registry', 'Disable npm registry API fallback for unresolved licenses')
    .option('--no-license-cache', 'Disable cross-run license cache at ~/.cache/vow/licenses/')
    .option('-f, --format <fmt>', 'Output format: terminal, json, csv, markdown', 'terminal')
    .option('-o, --output <file>', 'Write output to file')
    .action(async (opts: ScanOptions) => {
      const result = await executeScan(opts);

      let output: string;
      switch (opts.format) {
        case 'json':
          output = toJSON(result, true);
          break;
        case 'csv':
          output = toCSV(result);
          break;
        case 'markdown':
          output = toMarkdown(result);
          break;
        default:
          output = reportScanSummary(result);
      }

      if (opts.output) {
        await writeFile(opts.output, output, 'utf-8');
        console.log(`Report written to ${opts.output}`);
      } else {
        console.log(output);
      }
    });
}
