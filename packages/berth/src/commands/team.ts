import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { GlobalOptions } from '../types.js';
import {
  findTeamConfig,
  loadTeamConfig,
  TeamConfigError,
} from '../config/team.js';
import { formatJson } from '../reporters/json.js';
import { parsePortString } from '../utils/ports.js';

interface TeamOptions extends GlobalOptions {
  dir?: string;
}

export async function teamShowCommand(options: TeamOptions): Promise<void> {
  const startDir = path.resolve(options.dir || process.cwd());
  let loaded;
  try {
    loaded = await loadTeamConfig(startDir);
  } catch (err) {
    if (options.json) {
      console.log(formatJson({ error: (err as Error).message }));
    } else {
      console.error(chalk.red((err as Error).message));
    }
    process.exitCode = 2;
    return;
  }
  if (!loaded) {
    if (options.json) {
      console.log(formatJson({ teamConfig: null }));
    } else {
      console.log(chalk.dim('No .berth/team.json found in this repo.'));
      console.log(
        chalk.dim(`Run ${chalk.white('berth team claim <project> <port>')} to create one.`),
      );
    }
    return;
  }

  if (options.json) {
    console.log(formatJson(loaded));
    return;
  }

  console.log(chalk.bold(`Team config: ${path.relative(process.cwd(), loaded.filePath)}`));
  const table = new Table({
    head: ['PORT', 'PROJECT', 'ROLE', 'OWNER'].map((h) => chalk.dim(h)),
    style: { head: [], border: [] },
  });
  for (const a of loaded.config.assignments.sort((x, y) => x.port - y.port)) {
    table.push([
      chalk.green(String(a.port)),
      a.project,
      a.role ?? chalk.dim('—'),
      a.owner ?? chalk.dim('—'),
    ]);
  }
  console.log(table.toString());

  if (loaded.config.reservedRanges?.length) {
    console.log(chalk.bold('\nReserved ranges:'));
    for (const r of loaded.config.reservedRanges) {
      console.log(`  ${chalk.cyan(`${r.from}–${r.to}`)}  ${r.purpose}`);
    }
  }
  if (loaded.config.forbidden?.length) {
    console.log(chalk.bold('\nForbidden ports:'));
    for (const f of loaded.config.forbidden) {
      console.log(`  ${chalk.red(String(f.port))}  ${f.reason}`);
    }
  }
}

export async function teamLintCommand(options: TeamOptions): Promise<void> {
  const startDir = path.resolve(options.dir || process.cwd());
  try {
    const loaded = await loadTeamConfig(startDir);
    if (!loaded) {
      if (options.json) {
        console.log(formatJson({ ok: true, message: 'no team config present' }));
      } else {
        console.log(chalk.dim('No team config to lint.'));
      }
      return;
    }
    if (options.json) {
      console.log(formatJson({ ok: true, filePath: loaded.filePath }));
    } else {
      console.log(chalk.green(`✓ ${path.relative(process.cwd(), loaded.filePath)} is valid.`));
    }
  } catch (err) {
    const msg = err instanceof TeamConfigError ? err.message : (err as Error).message;
    if (options.json) {
      console.log(formatJson({ ok: false, error: msg }));
    } else {
      console.error(chalk.red(`✗ ${msg}`));
    }
    process.exitCode = 1;
  }
}

export async function teamClaimCommand(
  project: string,
  portArg: string,
  options: TeamOptions & { role?: string; owner?: string },
): Promise<void> {
  const port = parsePortString(portArg);
  if (port === null) {
    console.error(chalk.red(`Invalid port: ${portArg}`));
    process.exitCode = 2;
    return;
  }
  const startDir = path.resolve(options.dir || process.cwd());
  const existing = await findTeamConfig(startDir);
  const target = existing ?? path.join(startDir, '.berth', 'team.json');

  let config = { version: 1 as const, assignments: [] as Array<{ port: number; project: string; role?: string; owner?: string }> };
  if (existing) {
    const loaded = await loadTeamConfig(startDir);
    if (loaded) config = loaded.config as typeof config;
  }

  const conflict = config.assignments.find((a) => a.port === port);
  if (conflict && conflict.project !== project) {
    if (options.json) {
      console.log(formatJson({ error: 'port-already-claimed', existing: conflict }));
    } else {
      console.error(
        chalk.red(
          `Port ${port} is already claimed by "${conflict.project}". ` +
            `Edit .berth/team.json directly or pick another port.`,
        ),
      );
    }
    process.exitCode = 1;
    return;
  }

  // Remove any prior entry for the same project+port, then add.
  const next = {
    ...config,
    assignments: config.assignments.filter((a) => a.port !== port),
  };
  next.assignments.push({
    port,
    project,
    ...(options.role ? { role: options.role } : {}),
    ...(options.owner ? { owner: options.owner } : {}),
  });
  next.assignments.sort((a, b) => a.port - b.port);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(next, null, 2) + '\n', 'utf-8');

  if (options.json) {
    console.log(formatJson({ claimed: { port, project }, filePath: target }));
  } else {
    console.log(
      chalk.green(`Claimed port ${port} for "${project}" in ${path.relative(process.cwd(), target)}`),
    );
  }
}
