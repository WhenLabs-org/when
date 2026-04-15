import chalk from 'chalk';
import Table from 'cli-table3';
import type {
  StatusOutput,
  CheckOutput,
  KillOutput,
  RegisteredProject,
  ActivePort,
  DockerPort,
  Conflict,
  Resolution,
} from '../types.js';
import { WELL_KNOWN_PORTS } from '../utils/ports.js';

export function renderStatus(output: StatusOutput): string {
  const lines: string[] = [];

  // Active Ports
  if (output.active.length > 0) {
    // Build a map of ports owned by Docker containers for annotation
    const dockerPortMap = new Map(output.docker.map((d) => [d.port, d]));

    lines.push(chalk.bold('\n── Active Ports ' + '─'.repeat(50)));
    const table = new Table({
      head: ['PORT', 'PID', 'PROCESS', 'TYPE', 'PROJECT', 'ADDRESS'].map((h) => chalk.dim(h)),
      style: { head: [], border: [] },
      chars: tableChars(),
    });
    for (const p of output.active.sort((a, b) => a.port - b.port)) {
      const dp = dockerPortMap.get(p.port);
      const typeLabel = dp
        ? chalk.cyan(`docker (${dp.containerName})`)
        : chalk.dim('native');
      table.push([
        chalk.green(String(p.port)),
        String(p.pid),
        p.process,
        typeLabel,
        p.project || portLabel(p.port),
        chalk.dim(p.address),
      ]);
    }
    lines.push(table.toString());
  }

  // Docker Ports
  if (output.docker.length > 0) {
    lines.push(chalk.bold('\n── Docker Ports ' + '─'.repeat(50)));
    const table = new Table({
      head: ['PORT', 'CONTAINER', 'IMAGE', 'STATUS', 'HEALTH'].map((h) => chalk.dim(h)),
      style: { head: [], border: [] },
      chars: tableChars(),
    });
    for (const p of output.docker.sort((a, b) => a.port - b.port)) {
      table.push([
        chalk.cyan(String(p.port)),
        p.containerName,
        p.image,
        chalk.green(p.status),
        formatDockerHealth(p),
      ]);
    }
    lines.push(table.toString());
  }

  // Configured But Not Running
  const configuredOnly = output.configured.filter(
    (c) => !output.active.some((a) => a.port === c.port) && !output.docker.some((d) => d.port === c.port),
  );
  if (configuredOnly.length > 0) {
    lines.push(chalk.bold('\n── Configured But Not Running ' + '─'.repeat(37)));
    const table = new Table({
      head: ['PORT', 'PROJECT', 'SOURCE'].map((h) => chalk.dim(h)),
      style: { head: [], border: [] },
      chars: tableChars(),
    });
    for (const p of configuredOnly.sort((a, b) => a.port - b.port)) {
      table.push([
        chalk.yellow(String(p.port)),
        p.projectName,
        p.context,
      ]);
    }
    lines.push(table.toString());
  }

  // Conflicts
  if (output.conflicts.length > 0) {
    lines.push('');
    for (const conflict of output.conflicts) {
      lines.push(renderConflict(conflict));
    }
  }

  // Summary
  const s = output.summary;
  lines.push(
    `\n── Summary: ${chalk.green(String(s.activePorts))} active, ` +
    `${chalk.cyan(String(s.dockerPorts))} docker, ` +
    `${chalk.yellow(String(s.configuredPorts))} configured` +
    (s.conflictCount > 0 ? `, ${chalk.red(String(s.conflictCount) + ' conflicts')}` : ''),
  );

  return lines.join('\n');
}

export function renderCheck(output: CheckOutput): string {
  const lines: string[] = [];

  lines.push(chalk.bold(`\nChecking port requirements for ${output.project}/...\n`));

  // Scanned sources
  lines.push('Sources scanned:');
  for (const src of output.scannedSources) {
    lines.push(`  ${chalk.green('✓')} ${src.file} (${src.portsFound} port${src.portsFound !== 1 ? 's' : ''})`);
  }

  if (output.conflicts.length === 0) {
    lines.push(chalk.green('\n  No conflicts detected! All ports are free.\n'));
    return lines.join('\n');
  }

  lines.push(chalk.bold('\n── Conflicts ' + '─'.repeat(53)));
  for (const conflict of output.conflicts) {
    lines.push(renderConflict(conflict));
  }

  if (output.resolutions.length > 0) {
    lines.push(chalk.bold('\n── Suggested Fixes ' + '─'.repeat(47)));
    for (const res of output.resolutions) {
      const icon = res.automatic ? chalk.green('→') : chalk.yellow('→');
      let detail = `  ${icon} ${res.description}`;

      // Add actionable commands for kill resolutions
      if (res.type === 'kill' && res.pid) {
        detail += `\n      ${chalk.dim(`Run: ${chalk.white(`kill ${res.pid}`)}`)}`;
        if (res.targetPort) {
          detail += `\n      ${chalk.dim(`Or:  ${chalk.white(`PORT=${res.targetPort} npm run dev`)}`)}`;
        }
      }
      if (res.type === 'remap-docker' && res.containerName) {
        detail += `\n      ${chalk.dim(`Run: ${chalk.white(`docker stop ${res.containerName}`)}`)}`;
      }

      lines.push(detail);
    }
  }

  return lines.join('\n');
}

export function renderKill(output: KillOutput): string {
  const lines: string[] = [];

  if (output.killed.length > 0) {
    lines.push(chalk.green(`Killed ${output.killed.length} process${output.killed.length !== 1 ? 'es' : ''}:`));
    for (const k of output.killed) {
      lines.push(`  ${k.pid} (${k.process}, port ${k.port}${k.project ? `, ${k.project}` : ''})`);
    }
    lines.push(`Freed ports: ${output.freedPorts.join(', ')}`);
  }

  if (output.failed.length > 0) {
    lines.push(chalk.red(`\nFailed to kill ${output.failed.length} process${output.failed.length !== 1 ? 'es' : ''}:`));
    for (const f of output.failed) {
      lines.push(`  ${chalk.red('✗')} PID ${f.pid} on port ${f.port}: ${f.error}`);
    }
  }

  if (output.killed.length === 0 && output.failed.length === 0) {
    lines.push(chalk.yellow('No processes found to kill.'));
  }

  return lines.join('\n');
}

export function renderList(projects: RegisteredProject[], activePorts: ActivePort[]): string {
  if (projects.length === 0) {
    return chalk.yellow('No projects registered. Run `berth register` in a project directory.');
  }

  const activePortSet = new Set(activePorts.map((p) => p.port));

  const table = new Table({
    head: ['PROJECT', 'PORTS', 'STATUS'].map((h) => chalk.dim(h)),
    style: { head: [], border: [] },
    chars: tableChars(),
  });

  for (const project of projects.sort((a, b) => a.name.localeCompare(b.name))) {
    const portList = project.ports.map((p) => String(p.port)).join(', ');
    const runningPorts = project.ports.filter((p) => activePortSet.has(p.port));
    const allRunning = runningPorts.length === project.ports.length && project.ports.length > 0;
    const someRunning = runningPorts.length > 0;

    let status: string;
    if (allRunning) {
      status = chalk.green('● running');
    } else if (someRunning) {
      status = chalk.yellow('◐ partial');
    } else {
      status = chalk.dim('○ stopped');
    }

    table.push([project.name, portList || chalk.dim('none'), status]);
  }

  return table.toString();
}

export function renderConflict(conflict: Conflict): string {
  const icon = conflict.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
  const lines = [`  ${icon} Port ${chalk.bold(String(conflict.port))} — ${conflict.suggestion}`];

  // Add actionable kill/stop commands
  for (const claimant of conflict.claimants) {
    if ('pid' in claimant && 'source' in claimant && ((claimant as ActivePort).source === 'lsof' || (claimant as ActivePort).source === 'netstat' || (claimant as ActivePort).source === 'ss')) {
      const ap = claimant as ActivePort;
      lines.push(chalk.dim(`    → Run: ${chalk.white(`kill ${ap.pid}`)}`));
      lines.push(chalk.dim(`    → Or use a different port: ${chalk.white(`PORT=${conflict.port + 1} npm run dev`)}`));
    }
    if ('containerId' in claimant) {
      const dp = claimant as DockerPort;
      lines.push(chalk.dim(`    → Run: ${chalk.white(`docker stop ${dp.containerName}`)}`));
    }
  }

  return lines.join('\n');
}

export function renderResolutions(resolutions: Resolution[]): string {
  return resolutions
    .map((r) => {
      const icon = r.automatic ? chalk.green('→') : chalk.yellow('→');
      return `  ${icon} ${r.description}`;
    })
    .join('\n');
}

function portLabel(port: number): string {
  return WELL_KNOWN_PORTS[port] ? chalk.dim(`(${WELL_KNOWN_PORTS[port]})`) : '';
}

function formatDockerHealth(dp: DockerPort): string {
  const status = dp.status.toLowerCase();
  if (status.includes('healthy')) return chalk.green('healthy');
  if (status.includes('unhealthy')) return chalk.red('unhealthy');
  if (status.includes('starting')) return chalk.yellow('starting');
  return chalk.dim(status);
}

function tableChars() {
  return {
    top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
    bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
    left: ' ', 'left-mid': '', mid: '', 'mid-mid': '',
    right: '', 'right-mid': '', middle: '  ',
  };
}
