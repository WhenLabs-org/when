import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ora from 'ora';
import type { ScanResult, LicenseSummary, PackageInfo } from '../types.js';
import { NpmResolver } from '../resolvers/npm.js';
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

  const spinner = ora('Scanning dependencies...').start();
  const ecosystems: string[] = [];

  // Detect and run resolvers
  const npmResolver = new NpmResolver({
    projectPath,
    includeDevDependencies: !opts.production,
    depth: opts.depth,
  });

  const allPackages: PackageInfo[] = [];
  let graph: DepGraph;

  if (await npmResolver.detect()) {
    ecosystems.push('npm');
    spinner.text = `Scanning npm dependencies...`;

    const resolved = await npmResolver.resolve();

    spinner.text = `Resolved ${resolved.length} npm packages. Building graph...`;

    graph = buildGraph(resolved, rootName, rootVersion, directDependencyNames);

    for (const pkg of resolved) {
      allPackages.push({
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        dependencyType: pkg.dependencyType,
        path: pkg.path,
        rawLicense: pkg.rawLicense,
      });
    }
  } else {
    graph = buildGraph([], rootName, rootVersion, directDependencyNames);
  }

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
