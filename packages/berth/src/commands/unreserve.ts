import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { loadRegistry, saveRegistry } from '../registry/store.js';
import { findReservation, removeReservation } from '../registry/reservations.js';
import { parsePortString } from '../utils/ports.js';
import { formatJson } from '../reporters/json.js';
import { appendEvent } from '../history/recorder.js';

export async function unreserveCommand(
  portArg: string,
  options: GlobalOptions,
): Promise<void> {
  const port = parsePortString(portArg);
  if (port === null) {
    console.error(chalk.red(`Invalid port: ${portArg}`));
    process.exitCode = 2;
    return;
  }

  const registry = await loadRegistry();
  const existing = findReservation(registry, port);
  if (!existing) {
    if (options.json) {
      console.log(formatJson({ removed: false, port }));
    } else {
      console.log(chalk.yellow(`No reservation exists for port ${port}.`));
    }
    return;
  }

  const updated = removeReservation(registry, port);
  await saveRegistry(updated);

  await appendEvent({
    type: 'reservation-removed',
    at: new Date().toISOString(),
    port,
    project: existing.project,
  }).catch(() => {});

  if (options.json) {
    console.log(formatJson({ removed: true, reservation: existing }));
  } else {
    console.log(
      chalk.green(`Removed reservation on port ${port} (was "${existing.project}").`),
    );
  }
}
