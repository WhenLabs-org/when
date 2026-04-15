import { watch } from 'node:fs';
import { resolve, join } from 'node:path';
import fg from 'fast-glob';
import chalk from 'chalk';
import type { CliFlags } from '../types.js';
import { resolveConfig } from '../config.js';
import { scanCommand } from './scan.js';

export async function watchCommand(options: CliFlags): Promise<void> {
  const projectPath = resolve(options.path ?? process.cwd());
  const config = await resolveConfig(projectPath, options);

  // Resolve doc patterns to get list of files to watch
  const docFiles = await fg(config.docs, { cwd: projectPath });
  const srcFiles = await fg(['src/**/*', 'lib/**/*', 'package.json', 'Makefile'], {
    cwd: projectPath,
    ignore: ['node_modules/**', 'dist/**'],
  });

  const watchFiles = [...docFiles, ...srcFiles];

  console.log(chalk.bold('Stale — Watch Mode'));
  if (process.platform === 'linux') {
    console.log(chalk.yellow('Warning: recursive file watching is not supported on Linux. Only top-level changes will be detected.'));
    console.log(chalk.yellow('Consider using a file watcher like nodemon or entr to trigger `stale scan` on changes instead.'));
  }
  console.log(chalk.dim(`Watching ${watchFiles.length} files for changes...`));
  console.log('');

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const runScan = () => {
    console.clear();
    console.log(chalk.dim(`[${new Date().toLocaleTimeString()}] Change detected, re-scanning...`));
    console.log('');
    scanCommand({ ...options, format: options.format ?? 'terminal' }).catch((err) => {
      console.error(chalk.red(`Scan failed: ${err.message}`));
    });
  };

  // Watch the project directory
  const watcher = watch(projectPath, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (filename.includes('node_modules') || filename.includes('.git') || filename.includes('dist')) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runScan, 300);
  });

  // Initial scan
  await scanCommand({ ...options, format: options.format ?? 'terminal' });

  // Keep process alive
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
}
