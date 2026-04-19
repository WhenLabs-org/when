import { shellExec } from '../../utils/platform.js';
import type { ActivePort } from '../../types.js';

export async function detectActivePorts(): Promise<ActivePort[]> {
  let result;
  try {
    result = await shellExec('lsof', ['-i', '-P', '-n', '-sTCP:LISTEN']);
  } catch {
    // lsof not found, try ss
    try {
      return await detectWithSs();
    } catch {
      return [];
    }
  }

  if (!result.stdout.trim()) return [];
  return parseLsofOutput(result.stdout);
}

export function parseLsofOutput(output: string): ActivePort[] {
  const lines = output.trim().split('\n');
  if (lines.length < 2) return [];

  // Skip header line
  const dataLines = lines.slice(1);
  const seen = new Map<string, ActivePort>();

  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;

    const command = parts[0];
    const pid = parseInt(parts[1], 10);
    const user = parts[2];
    // NAME field may be followed by (LISTEN) — find the part with a colon and port
    const namePart = parts.find((p, i) => i >= 8 && /:\d+$/.test(p)) ?? parts[parts.length - 1];
    // Also try joining the tail to handle "* :3000 (LISTEN)" edge cases
    const nameCandidate = namePart.replace(/\(LISTEN\)/, '').trim();

    const portMatch = nameCandidate.match(/(?:\*|[\d.]+|\[.*?\]):(\d+)$/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1], 10);
    if (isNaN(port) || port < 1 || port > 65535) continue;

    const address = nameCandidate.replace(`:${port}`, '');
    const key = `${pid}:${port}`;

    // Deduplicate: same PID + port across IPv4/IPv6
    if (!seen.has(key)) {
      seen.set(key, {
        port,
        pid,
        process: command,
        command: command,
        user,
        protocol: 'tcp',
        address: normalizeAddress(address),
        source: 'lsof',
      });
    }
  }

  return Array.from(seen.values());
}

function normalizeAddress(addr: string): string {
  if (addr === '*' || addr === '::' || addr === '[::]') return '0.0.0.0';
  if (addr === '[::1]') return '127.0.0.1';
  return addr;
}

async function detectWithSs(): Promise<ActivePort[]> {
  const result = await shellExec('ss', ['-tlnp']);
  if (!result.stdout.trim()) return [];

  const lines = result.stdout.trim().split('\n').slice(1);
  const ports: ActivePort[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;

    const localAddr = parts[3];
    const portMatch = localAddr.match(/:(\d+)$/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1], 10);
    const address = localAddr.replace(`:${port}`, '');

    let pid = 0;
    let processName = 'unknown';
    const pidMatch = line.match(/pid=(\d+)/);
    const nameMatch = line.match(/users:\(\("([^"]+)"/);
    if (pidMatch) pid = parseInt(pidMatch[1], 10);
    if (nameMatch) processName = nameMatch[1];

    ports.push({
      port,
      pid,
      process: processName,
      command: processName,
      user: '',
      protocol: 'tcp',
      address: normalizeAddress(address),
      source: 'ss' as 'ss',
    });
  }

  return ports;
}
