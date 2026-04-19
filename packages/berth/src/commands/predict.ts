import path from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { GlobalOptions, ActivePort, DockerPort, ConfiguredPort } from '../types.js';
import { detectAllActive, detectAllConfigured } from '../detectors/index.js';
import { formatJson } from '../reporters/json.js';
import { findFreePort } from '../utils/ports.js';
import { buildScanContext } from './_context.js';

export interface PredictedPort {
  port: number;
  wantedBy: string;
  source: string;
  status: 'free' | 'in-use' | 'docker';
  occupiedBy?: string;
  pid?: number;
  containerName?: string;
  suggestion?: string;
}

export interface PredictOutput {
  project: string;
  directory: string;
  ports: PredictedPort[];
  conflicts: number;
}

export async function predictCommand(dir: string, options: GlobalOptions): Promise<void> {
  const absDir = path.resolve(dir);
  const ctx = await buildScanContext(absDir, { skipRegistry: true });
  const projectName = ctx.config?.projectName ?? path.basename(absDir);

  const [{ ports: active, docker }, { ports: configured, warnings }] = await Promise.all([
    detectAllActive({ registry: ctx.detectorRegistry, config: ctx.config }),
    detectAllConfigured(absDir, { registry: ctx.detectorRegistry, config: ctx.config }),
  ]);

  // Deduplicate configured ports by port number, keeping highest confidence
  const portMap = new Map<number, ConfiguredPort>();
  for (const cp of configured) {
    const existing = portMap.get(cp.port);
    if (!existing || confidenceRank(cp.confidence) > confidenceRank(existing.confidence)) {
      portMap.set(cp.port, cp);
    }
  }

  const activeByPort = new Map<number, ActivePort>();
  for (const ap of active) {
    activeByPort.set(ap.port, ap);
  }

  const dockerByPort = new Map<number, DockerPort>();
  for (const dp of docker) {
    dockerByPort.set(dp.port, dp);
  }

  const predicted: PredictedPort[] = [];
  let conflictCount = 0;

  for (const [port, cp] of portMap) {
    const ap = activeByPort.get(port);
    const dp = dockerByPort.get(port);

    const entry: PredictedPort = {
      port,
      wantedBy: formatWantedBy(cp),
      source: cp.source,
      status: 'free',
    };

    if (dp) {
      entry.status = 'docker';
      entry.containerName = dp.containerName;
      entry.occupiedBy = `Docker: ${dp.containerName} (${dp.image}) [${dp.status}]`;
      conflictCount++;

      entry.suggestion =
        `Port ${port} is used by Docker container "${dp.containerName}".\n` +
        `  → Run: docker stop ${dp.containerName}\n` +
        `  → Or remap: change host port in docker-compose.yml`;
    } else if (ap) {
      entry.status = 'in-use';
      entry.pid = ap.pid;
      entry.occupiedBy = `${ap.process} (PID ${ap.pid})`;
      conflictCount++;

      try {
        const altPort = await findFreePort(port + 1, [port]);
        entry.suggestion =
          `Port ${port} is blocked by PID ${ap.pid} (${ap.process}).\n` +
          `  → Run: kill ${ap.pid}\n` +
          `  → Or use a different port: PORT=${altPort} npm run dev`;
      } catch {
        entry.suggestion =
          `Port ${port} is blocked by PID ${ap.pid} (${ap.process}).\n` +
          `  → Run: kill ${ap.pid}`;
      }
    }

    predicted.push(entry);
  }

  // Sort by port number
  predicted.sort((a, b) => a.port - b.port);

  const output: PredictOutput = {
    project: projectName,
    directory: absDir,
    ports: predicted,
    conflicts: conflictCount,
  };

  if (options.json) {
    console.log(formatJson(output));
  } else {
    console.log(renderPredict(output, options.verbose));
    if (options.verbose) {
      for (const w of warnings) {
        console.error(`Warning: ${w}`);
      }
    }
  }

  if (conflictCount > 0) {
    process.exitCode = 1;
  }
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

function formatWantedBy(cp: ConfiguredPort): string {
  const file = path.basename(cp.sourceFile);
  // e.g. "package.json (dev)" or "docker-compose.yml (web)" or ".env (API_PORT)"
  if (cp.source === 'package-json') {
    const scriptMatch = cp.context.match(/^scripts\.(\S+)/);
    return scriptMatch ? `${file} (${scriptMatch[1]})` : file;
  }
  if (cp.source === 'dotenv') {
    const envKey = cp.context.split('=')[0];
    return `${file} (${envKey})`;
  }
  if (cp.source === 'docker-compose') {
    const svcMatch = cp.context.match(/^services\.(\S+)/);
    return svcMatch ? `${file} (${svcMatch[1]})` : file;
  }
  if (cp.source === 'framework-default') {
    return cp.context; // e.g. "Next.js default port"
  }
  return `${file}`;
}

function renderPredict(output: PredictOutput, _verbose: boolean): string {
  const lines: string[] = [];

  lines.push(chalk.bold(`\nPort predictions for ${output.project}/\n`));

  if (output.ports.length === 0) {
    lines.push(chalk.yellow('  No configured ports detected in this project.\n'));
    return lines.join('\n');
  }

  const table = new Table({
    head: ['Port', 'Wanted By', 'Status'].map((h) => chalk.dim(h)),
    style: { head: [], border: [] },
    chars: tableChars(),
  });

  for (const p of output.ports) {
    let statusStr: string;
    if (p.status === 'free') {
      statusStr = chalk.green('FREE');
    } else if (p.status === 'docker') {
      statusStr = chalk.cyan(`DOCKER: ${p.containerName}`);
    } else {
      statusStr = chalk.red(`IN USE by ${p.occupiedBy}`);
    }

    table.push([
      chalk.bold(String(p.port)),
      p.wantedBy,
      statusStr,
    ]);
  }

  lines.push(table.toString());

  // Show suggestions for conflicts
  const conflicts = output.ports.filter((p) => p.status !== 'free');
  if (conflicts.length > 0) {
    lines.push(chalk.bold('\n── Suggested Fixes ' + '─'.repeat(47)));
    for (const p of conflicts) {
      if (p.suggestion) {
        lines.push('');
        for (const line of p.suggestion.split('\n')) {
          lines.push(`  ${line}`);
        }
      }
    }
    lines.push('');
  } else {
    lines.push(chalk.green('\n  All ports are free! Ready to start.\n'));
  }

  return lines.join('\n');
}

function tableChars() {
  return {
    top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
    bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
    left: ' ', 'left-mid': '', mid: '', 'mid-mid': '',
    right: '', 'right-mid': '', middle: '  ',
  };
}
