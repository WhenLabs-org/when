import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { loadRegistry, saveRegistry } from '../registry/store.js';
import {
  addReservation,
  findReservation,
  parseExpiry,
} from '../registry/reservations.js';
import { parsePortString } from '../utils/ports.js';
import { formatJson } from '../reporters/json.js';
import { appendEvent } from '../history/recorder.js';

interface ReserveOptions extends GlobalOptions {
  for: string;
  reason?: string;
  expires?: string;
  force?: boolean;
}

export async function reserveCommand(
  portArg: string,
  options: ReserveOptions,
): Promise<void> {
  const port = parsePortString(portArg);
  if (port === null) {
    console.error(chalk.red(`Invalid port: ${portArg}`));
    process.exitCode = 2;
    return;
  }

  const registry = await loadRegistry();
  const existing = findReservation(registry, port);
  if (existing && !options.force) {
    if (options.json) {
      console.log(formatJson({ error: 'already-reserved', existing }));
    } else {
      console.error(
        chalk.red(
          `Port ${port} is already reserved for "${existing.project}". ` +
            `Pass --force to override.`,
        ),
      );
    }
    process.exitCode = 1;
    return;
  }

  let expiresAt: string | undefined;
  try {
    expiresAt = parseExpiry(options.expires);
  } catch (err) {
    console.error(chalk.red((err as Error).message));
    process.exitCode = 2;
    return;
  }

  const reservation = {
    port,
    project: options.for,
    reason: options.reason,
    createdAt: new Date().toISOString(),
    expiresAt,
    source: 'manual' as const,
  };

  const updated = addReservation(registry, reservation);
  await saveRegistry(updated);

  await appendEvent({
    type: 'reservation-added',
    at: reservation.createdAt,
    port,
    project: options.for,
    reason: options.reason,
  }).catch(() => {});

  if (options.json) {
    console.log(formatJson({ reserved: reservation }));
  } else {
    const suffix = expiresAt ? chalk.dim(` (expires ${expiresAt})`) : '';
    console.log(
      chalk.green(`Reserved port ${port} for "${options.for}"`) + suffix,
    );
    if (options.reason) console.log(chalk.dim(`  reason: ${options.reason}`));
  }
}
