import chalk from 'chalk';
import Table from 'cli-table3';
import type { GlobalOptions } from '../types.js';
import { parseSince, readEvents } from '../history/recorder.js';
import type { HistoryEvent } from '../history/events.js';
import { formatJson } from '../reporters/json.js';
import { parsePortString } from '../utils/ports.js';

interface HistoryOptions extends GlobalOptions {
  port?: string;
  since?: string;
  limit?: string;
  flapping?: boolean;
  type?: HistoryEvent['type'];
}

export async function historyCommand(
  portArg: string | undefined,
  options: HistoryOptions,
): Promise<void> {
  const port = portArg ? parsePortString(portArg) ?? undefined : undefined;
  if (portArg && port === undefined) {
    console.error(chalk.red(`Invalid port: ${portArg}`));
    process.exitCode = 2;
    return;
  }
  const since = options.since ? parseSince(options.since) : undefined;
  const limit = options.limit ? parseInt(options.limit, 10) : undefined;

  const events = await readEvents({
    port,
    since,
    limit,
    type: options.type,
  });

  if (options.flapping) {
    const report = buildFlappingReport(events);
    if (options.json) {
      console.log(formatJson({ flapping: report }));
      return;
    }
    if (report.length === 0) {
      console.log(chalk.dim('No flapping ports detected.'));
      return;
    }
    const table = new Table({
      head: ['PORT', 'CLAIMS', 'RELEASES', 'TYPICAL PROCESS'].map((h) => chalk.dim(h)),
      style: { head: [], border: [] },
    });
    for (const row of report) {
      table.push([
        chalk.green(String(row.port)),
        String(row.claims),
        String(row.releases),
        row.typicalProcess ?? chalk.dim('—'),
      ]);
    }
    console.log(table.toString());
    return;
  }

  if (options.json) {
    console.log(formatJson({ events }));
    return;
  }

  if (events.length === 0) {
    console.log(chalk.dim('No history events match.'));
    return;
  }

  for (const e of events) console.log(renderEvent(e));
}

function renderEvent(e: HistoryEvent): string {
  const ts = chalk.dim(new Date(e.at).toLocaleString());
  switch (e.type) {
    case 'port-claimed':
      return `${ts}  ${chalk.green('claim   ')} port ${chalk.bold(String(e.port))} by ${e.process} (PID ${e.pid})${e.project ? ` [${e.project}]` : ''}`;
    case 'port-released':
      return `${ts}  ${chalk.dim('release ')} port ${chalk.bold(String(e.port))} (PID ${e.pid})`;
    case 'conflict-observed':
      return `${ts}  ${chalk.red('conflict')} port ${chalk.bold(String(e.port))} — ${e.severity} (${e.claimants} claimants)`;
    case 'resolution-applied':
      return `${ts}  ${chalk.cyan('resolve ')} port ${chalk.bold(String(e.port))} via ${e.action} — ${e.success ? 'ok' : 'failed'}`;
    case 'reservation-added':
      return `${ts}  ${chalk.magenta('reserve ')} port ${chalk.bold(String(e.port))} for ${e.project}${e.reason ? ` (${e.reason})` : ''}`;
    case 'reservation-removed':
      return `${ts}  ${chalk.magenta('unreserve')} port ${chalk.bold(String(e.port))} (was ${e.project})`;
  }
}

interface FlappingRow {
  port: number;
  claims: number;
  releases: number;
  typicalProcess?: string;
}

export function buildFlappingReport(events: HistoryEvent[]): FlappingRow[] {
  const perPort = new Map<
    number,
    { claims: number; releases: number; processes: Map<string, number> }
  >();
  for (const e of events) {
    if (e.type !== 'port-claimed' && e.type !== 'port-released') continue;
    const entry = perPort.get(e.port) ?? { claims: 0, releases: 0, processes: new Map() };
    if (e.type === 'port-claimed') {
      entry.claims++;
      entry.processes.set(e.process, (entry.processes.get(e.process) ?? 0) + 1);
    } else {
      entry.releases++;
    }
    perPort.set(e.port, entry);
  }
  const rows: FlappingRow[] = [];
  for (const [port, entry] of perPort) {
    // A port is "flapping" when combined claim+release volume is ≥3.
    if (entry.claims + entry.releases < 3) continue;
    let typical: string | undefined;
    let max = 0;
    for (const [proc, count] of entry.processes) {
      if (count > max) {
        max = count;
        typical = proc;
      }
    }
    rows.push({ port, claims: entry.claims, releases: entry.releases, typicalProcess: typical });
  }
  return rows.sort((a, b) => b.claims + b.releases - (a.claims + a.releases));
}
