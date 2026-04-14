import { shellExec } from '../../utils/platform.js';
import type { ActivePort } from '../../types.js';

export async function detectActivePorts(): Promise<ActivePort[]> {
  const result = await shellExec('netstat', ['-ano', '-p', 'TCP']);
  if (!result.stdout.trim()) return [];

  return parseNetstatOutput(result.stdout);
}

export function parseNetstatOutput(output: string): ActivePort[] {
  const lines = output.trim().split('\n');
  const ports: ActivePort[] = [];
  const pidsToResolve = new Set<number>();

  for (const line of lines) {
    if (!line.includes('LISTENING')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;

    const localAddr = parts[1];
    const pid = parseInt(parts[parts.length - 1], 10);

    const portMatch = localAddr.match(/:(\d+)$/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1], 10);
    if (isNaN(port) || port < 1 || port > 65535) continue;
    if (pid === 0 || pid === 4) continue; // System processes

    const address = localAddr.replace(`:${port}`, '');

    pidsToResolve.add(pid);
    ports.push({
      port,
      pid,
      process: 'unknown',
      command: 'unknown',
      user: '',
      protocol: 'tcp',
      address: normalizeAddress(address),
      source: 'netstat',
    });
  }

  return ports;
}

export async function resolveProcessNames(ports: ActivePort[]): Promise<ActivePort[]> {
  const uniquePids = [...new Set(ports.map((p) => p.pid))];
  const nameMap = new Map<number, string>();

  for (const pid of uniquePids) {
    try {
      const result = await shellExec('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
      const match = result.stdout.match(/"([^"]+)"/);
      if (match) nameMap.set(pid, match[1]);
    } catch {
      // tasklist not available or failed
    }
  }

  return ports.map((p) => ({
    ...p,
    process: nameMap.get(p.pid) ?? p.process,
    command: nameMap.get(p.pid) ?? p.command,
  }));
}

function normalizeAddress(addr: string): string {
  if (addr === '0.0.0.0' || addr === '[::]' || addr === '::') return '0.0.0.0';
  if (addr === '127.0.0.1' || addr === '[::1]') return '127.0.0.1';
  return addr;
}
