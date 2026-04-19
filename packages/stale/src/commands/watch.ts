import { resolve } from 'node:path';
import chokidar from 'chokidar';
import chalk from 'chalk';
import type { CliFlags } from '../types.js';
import { resolveConfig } from '../config.js';
import { scanCommand } from './scan.js';

const DEBOUNCE_MS = 300;

const WATCH_PATTERNS = [
  'src/**/*',
  'lib/**/*',
  'app/**/*',
  'apps/**/*',
  'packages/**/*',
  'package.json',
  'Makefile',
  '.env*',
  'docker-compose*.y*ml',
  'compose*.y*ml',
];

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /(^|\/)dist\//,
  /coverage\//,
  /\.stale-cache\//,
];

export async function watchCommand(options: CliFlags): Promise<void> {
  const projectPath = resolve(options.path ?? process.cwd());
  const config = await resolveConfig(projectPath, options);

  const targets = [...config.docs, ...WATCH_PATTERNS];
  const watcher = chokidar.watch(targets, {
    cwd: projectPath,
    ignoreInitial: true,
    ignored: IGNORE_PATTERNS,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  console.log(chalk.bold('Stale — Watch Mode'));
  console.log(chalk.dim(`Watching ${projectPath} for changes...`));
  console.log('');

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  const runScan = async (trigger?: string): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      console.clear();
      const header = trigger
        ? `[${new Date().toLocaleTimeString()}] Change detected in ${trigger}, re-scanning...`
        : `[${new Date().toLocaleTimeString()}] Running initial scan...`;
      console.log(chalk.dim(header));
      console.log('');
      await scanCommand({ ...options, format: options.format ?? 'terminal' });
    } catch (err) {
      console.error(chalk.red(`Scan failed: ${(err as Error).message}`));
    } finally {
      inFlight = false;
    }
  };

  const scheduleScan = (trigger: string): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runScan(trigger), DEBOUNCE_MS);
  };

  watcher.on('add', (path) => scheduleScan(path));
  watcher.on('change', (path) => scheduleScan(path));
  watcher.on('unlink', (path) => scheduleScan(path));
  watcher.on('error', (err) => {
    console.error(chalk.red(`Watcher error: ${(err as Error).message}`));
  });

  // Initial scan (bypasses debounce + ignoreInitial)
  await runScan();

  process.on('SIGINT', () => {
    void watcher.close();
    process.exit(0);
  });
}
