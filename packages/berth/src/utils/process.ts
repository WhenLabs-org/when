import type { ActivePort } from '../types.js';

const SYSTEM_PROCESSES = new Set([
  'postgres', 'postgresql',
  'redis-server', 'redis',
  'mysqld', 'mysql',
  'mongod', 'mongos',
  'nginx', 'httpd', 'apache2',
  'sshd', 'systemd', 'launchd',
]);

const DEV_TOOL_PATTERNS = [
  'node_modules/.bin/',
  'next dev', 'next start',
  'vite', 'webpack',
  'react-scripts', 'ng serve',
  'storybook', 'remix dev',
  'astro dev', 'nuxt dev',
  'gatsby develop', 'parcel',
  'tsx ', 'ts-node',
  'nodemon', 'pm2',
];

export function isDevProcess(proc: ActivePort): boolean {
  const name = proc.process.toLowerCase();
  if (SYSTEM_PROCESSES.has(name)) return false;

  const cmd = proc.command.toLowerCase();
  if (DEV_TOOL_PATTERNS.some((p) => cmd.includes(p))) return true;
  if (['node', 'deno', 'bun', 'python', 'python3', 'ruby'].includes(name)) return true;

  return false;
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<boolean> {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

export async function gracefulKill(pid: number, timeoutMs = 3000): Promise<boolean> {
  if (!isProcessRunning(pid)) return true;

  try {
    process.kill(pid, 'SIGTERM');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return true;
    throw err;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessRunning(pid)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      return false;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return !isProcessRunning(pid);
}
