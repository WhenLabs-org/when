import type { GlobalOptions, StatusOutput } from '../types.js';
import { detectAllActive, detectAllConfigured } from '../detectors/index.js';
import { detectAllConflicts } from '../resolver/conflicts.js';
import { loadRegistry } from '../registry/store.js';
import { activeReservations } from '../registry/reservations.js';
import { renderStatus } from '../reporters/terminal.js';
import { formatJson } from '../reporters/json.js';
import { wrapStatus } from '../reporters/mcp.js';
import { buildScanContext } from './_context.js';
import { detectEnvironment } from '../utils/environment.js';
import {
  appendEvents,
  diffSnapshots,
  readLastStatus,
  writeLastStatus,
  type PortSnapshot,
} from '../history/recorder.js';

export interface StatusCommandOptions extends GlobalOptions {
  trace?: boolean;
  mcp?: boolean;
}

export async function statusCommand(options: StatusCommandOptions): Promise<void> {
  const [{ ports: active, docker, warnings: activeWarnings }, registry] = await Promise.all([
    detectAllActive({ trace: options.trace }),
    loadRegistry(),
  ]);

  // Scan all registered project dirs for configured ports, using each
  // project's own config/plugins if it has a berth.config.
  const allConfigured = [];
  const configWarnings: string[] = [];
  for (const project of Object.values(registry.projects)) {
    try {
      const ctx = await buildScanContext(project.directory, { skipRegistry: true });
      const { ports, warnings } = await detectAllConfigured(project.directory, {
        registry: ctx.detectorRegistry,
        config: ctx.config,
      });
      allConfigured.push(...ports);
      configWarnings.push(...warnings);
      configWarnings.push(...ctx.warnings);
    } catch {
      configWarnings.push(`Failed to scan ${project.directory}`);
    }
  }

  // Link active ports to registered projects
  const portToProject = new Map<number, string>();
  for (const project of Object.values(registry.projects)) {
    for (const p of project.ports) {
      portToProject.set(p.port, project.name);
    }
  }
  for (const port of active) {
    if (!port.project && portToProject.has(port.port)) {
      port.project = portToProject.get(port.port);
    }
  }
  for (const port of docker) {
    if (!port.project && portToProject.has(port.port)) {
      port.project = portToProject.get(port.port);
    }
  }

  const reservations = activeReservations(registry);
  // Load team config from cwd so team-wide rules (forbidden, reservedRanges,
  // policies) apply to the cross-project view.
  const cwdCtx = await buildScanContext(process.cwd(), { skipRegistry: true });
  for (const tr of cwdCtx.reservations) {
    if (tr.source === 'team' && !reservations.some((r) => r.port === tr.port)) {
      reservations.push(tr);
    }
  }
  const conflicts = detectAllConflicts({
    active,
    docker,
    configured: allConfigured,
    reservations,
    team: cwdCtx.team,
  });
  const environment = await detectEnvironment();

  const output: StatusOutput = {
    active,
    docker,
    configured: allConfigured,
    conflicts,
    environment,
    summary: {
      activePorts: active.length,
      dockerPorts: docker.length,
      configuredPorts: allConfigured.length,
      conflictCount: conflicts.length,
    },
  };

  if (options.mcp) {
    console.log(formatJson(wrapStatus(output)));
  } else if (options.json) {
    console.log(formatJson(output));
  } else {
    console.log(renderStatus(output));
    if (options.verbose) {
      for (const w of [...activeWarnings, ...configWarnings]) {
        console.error(`Warning: ${w}`);
      }
    }
  }

  await recordStatusHistory(active);
}

async function recordStatusHistory(active: StatusOutput['active']): Promise<void> {
  try {
    const snapshot = {
      timestamp: new Date().toISOString(),
      ports: Object.fromEntries(
        active.map((p) => [
          String(p.port),
          { pid: p.pid, process: p.process, project: p.project } satisfies PortSnapshot,
        ]),
      ),
    };
    const prev = await readLastStatus();
    const events = diffSnapshots(prev, snapshot);
    if (events.length > 0) await appendEvents(events);
    await writeLastStatus(snapshot);
  } catch {
    // History is best-effort — never break status on write failures.
  }
}
