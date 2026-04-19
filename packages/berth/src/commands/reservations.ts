import chalk from 'chalk';
import Table from 'cli-table3';
import type { GlobalOptions } from '../types.js';
import { loadRegistry } from '../registry/store.js';
import { activeReservations } from '../registry/reservations.js';
import { formatJson } from '../reporters/json.js';

export async function reservationsCommand(options: GlobalOptions): Promise<void> {
  const registry = await loadRegistry();
  const active = activeReservations(registry);

  if (options.json) {
    console.log(formatJson({ reservations: active }));
    return;
  }

  if (active.length === 0) {
    console.log(chalk.dim('No active port reservations.'));
    console.log(
      chalk.dim(`Run ${chalk.white('berth reserve <port> --for <project>')} to create one.`),
    );
    return;
  }

  const table = new Table({
    head: ['PORT', 'PROJECT', 'SOURCE', 'EXPIRES', 'REASON'].map((h) => chalk.dim(h)),
    style: { head: [], border: [] },
  });

  const sorted = active.slice().sort((a, b) => a.port - b.port);
  for (const r of sorted) {
    table.push([
      chalk.green(String(r.port)),
      r.project,
      chalk.dim(r.source),
      r.expiresAt ? chalk.dim(r.expiresAt) : chalk.dim('—'),
      r.reason ?? chalk.dim('—'),
    ]);
  }

  console.log(table.toString());
}
