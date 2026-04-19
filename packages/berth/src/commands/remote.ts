import chalk from 'chalk';
import type { ActivePort, DockerPort, GlobalOptions, StatusOutput } from '../types.js';
import { shellExec } from '../utils/platform.js';
import { formatJson } from '../reporters/json.js';
import { renderStatus } from '../reporters/terminal.js';

interface RemoteOptions extends GlobalOptions {
  port?: string;
  identity?: string;
  fallback?: boolean;
}

export async function remoteCommand(
  host: string,
  options: RemoteOptions,
): Promise<void> {
  const sshArgs: string[] = [];
  if (options.port) sshArgs.push('-p', options.port);
  if (options.identity) sshArgs.push('-i', options.identity);
  sshArgs.push(host);

  // Primary path: run `berth status --json` on the remote.
  const primary = await shellExec('ssh', [...sshArgs, 'berth status --json'], {
    timeout: 30_000,
  }).catch((err) => ({ stdout: '', stderr: (err as Error).message, exitCode: 127 }));

  if (primary.exitCode === 0 && primary.stdout.trim()) {
    const parsed = parseRemoteStatus(primary.stdout, host);
    if (parsed) return emit(parsed, options, host);
  }

  // Fallback: parse `ss -tlnp` output from the remote host.
  if (options.fallback !== false) {
    const ss = await shellExec('ssh', [...sshArgs, 'ss -tlnp'], { timeout: 30_000 }).catch(
      (err) => ({ stdout: '', stderr: (err as Error).message, exitCode: 127 }),
    );
    if (ss.exitCode === 0 && ss.stdout.trim()) {
      const parsed = parseSsOutput(ss.stdout, host);
      return emit(parsed, options, host);
    }
  }

  if (options.json) {
    console.log(
      formatJson({
        error: 'remote-status-failed',
        stderr: primary.stderr,
        exitCode: primary.exitCode,
      }),
    );
  } else {
    console.error(chalk.red(`Could not get status from ${host}.`));
    if (primary.stderr) console.error(chalk.dim(primary.stderr.trim()));
  }
  process.exitCode = 1;
}

function parseRemoteStatus(stdout: string, host: string): StatusOutput | null {
  try {
    const parsed = JSON.parse(stdout) as StatusOutput;
    const tag = (p: ActivePort | DockerPort) => ({ ...p, project: p.project ?? `@${host}` });
    parsed.active = parsed.active.map(tag) as ActivePort[];
    parsed.docker = parsed.docker.map(tag) as DockerPort[];
    return parsed;
  } catch {
    return null;
  }
}

export function parseSsOutput(stdout: string, host: string): StatusOutput {
  const active: ActivePort[] = [];
  const lines = stdout.split('\n').slice(1); // drop header
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const parts = raw.trim().split(/\s+/);
    // ss output columns: State Recv-Q Send-Q Local Foreign Process
    const localAddr = parts[3];
    if (!localAddr) continue;
    const portMatch = localAddr.match(/:(\d+)$/);
    if (!portMatch) continue;
    const port = parseInt(portMatch[1], 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) continue;

    const pidMatch = raw.match(/pid=(\d+)/);
    const nameMatch = raw.match(/users:\(\("([^"]+)"/);
    active.push({
      port,
      pid: pidMatch ? parseInt(pidMatch[1], 10) : 0,
      process: nameMatch?.[1] ?? 'unknown',
      command: nameMatch?.[1] ?? 'unknown',
      user: '',
      protocol: 'tcp',
      address: localAddr.replace(`:${port}`, '') || '0.0.0.0',
      source: 'ss',
      project: `@${host}`,
    });
  }

  return {
    active,
    docker: [],
    configured: [],
    conflicts: [],
    summary: {
      activePorts: active.length,
      dockerPorts: 0,
      configuredPorts: 0,
      conflictCount: 0,
    },
  };
}

function emit(output: StatusOutput, options: RemoteOptions, host: string): void {
  if (options.json) {
    console.log(formatJson({ host, ...output }));
  } else {
    console.log(chalk.bold(`Remote status: ${host}`));
    console.log(renderStatus(output));
  }
}
