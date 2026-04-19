import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ora from 'ora';
import { NpmResolver } from '../resolvers/npm.js';
import { buildGraph } from '../graph/builder.js';
import { visualizeTree } from '../graph/visualizer.js';

interface TreeOptions {
  path: string;
  filter?: string;
  depth?: number;
  direction: 'top-down' | 'bottom-up';
  production: boolean;
}

export function registerTreeCommand(program: Command): void {
  program
    .command('tree')
    .description('Display dependency tree with license annotations')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('--filter <license>', 'Show only subtrees containing this license')
    .option('-d, --depth <n>', 'Max depth', parseInt)
    .option('--direction <dir>', 'top-down or bottom-up', 'top-down')
    .option('--production', 'Skip devDependencies', false)
    .action(async (opts: TreeOptions) => {
      const projectPath = path.resolve(opts.path);

      let rootName = 'unknown';
      let rootVersion = '0.0.0';
      const directDependencyNames = new Set<string>();
      try {
        const content = await readFile(path.join(projectPath, 'package.json'), 'utf-8');
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
        // fallback
      }

      const spinner = ora('Building dependency tree...').start();

      const npmResolver = new NpmResolver({
        projectPath,
        includeDevDependencies: !opts.production,
      });

      if (!(await npmResolver.detect())) {
        spinner.fail('No supported lockfile found');
        process.exit(2);
      }

      const resolved = await npmResolver.resolve();
      const graph = buildGraph(resolved, rootName, rootVersion, directDependencyNames);
      spinner.stop();

      const output = visualizeTree(graph, {
        maxDepth: opts.depth,
        showLicense: true,
        colorize: true,
        filter: opts.filter,
        direction: opts.direction as 'top-down' | 'bottom-up',
      });

      console.log(output);
    });
}
