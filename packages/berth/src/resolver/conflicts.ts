import type {
  ActivePort,
  DockerPort,
  ConfiguredPort,
  Conflict,
  PortInfo,
  Reservation,
  TeamConfig,
} from '../types.js';
import { detectRangeViolations } from '../config/team.js';

type Claimant = ActivePort | DockerPort | ConfiguredPort;

function isActivePort(c: Claimant): c is ActivePort {
  return 'pid' in c && 'source' in c && ((c as ActivePort).source === 'lsof' || (c as ActivePort).source === 'netstat');
}

function isDockerPort(c: Claimant): c is DockerPort {
  return 'containerId' in c;
}

function isConfiguredPort(c: Claimant): c is ConfiguredPort {
  return 'projectDir' in c && 'confidence' in c;
}

export function detectConflicts(
  active: ActivePort[],
  docker: DockerPort[],
  configured: ConfiguredPort[],
  reservations: Reservation[] = [],
): Conflict[] {
  // Build a map of port -> claimants
  const portMap = new Map<number, Claimant[]>();

  for (const p of active) {
    const list = portMap.get(p.port) || [];
    list.push(p);
    portMap.set(p.port, list);
  }
  for (const p of docker) {
    const list = portMap.get(p.port) || [];
    list.push(p);
    portMap.set(p.port, list);
  }
  for (const p of configured) {
    const list = portMap.get(p.port) || [];
    list.push(p);
    portMap.set(p.port, list);
  }

  const reservationByPort = new Map<number, Reservation>();
  for (const r of reservations) reservationByPort.set(r.port, r);

  const conflicts: Conflict[] = [];
  const reportedPorts = new Set<number>();

  // First pass: reservation-based conflicts on ports with claimants.
  for (const [port, claimants] of portMap) {
    const reservation = reservationByPort.get(port);
    if (!reservation) continue;

    // Configured claimants from a project other than the reservation owner → error.
    const offendingConfigured = claimants
      .filter(isConfiguredPort)
      .filter((c) => c.projectName !== reservation.project);

    if (offendingConfigured.length > 0) {
      conflicts.push({
        port,
        claimants,
        severity: 'error',
        suggestion:
          `Port ${port} is reserved for "${reservation.project}"` +
          (reservation.reason ? ` (${reservation.reason})` : '') +
          `. ${offendingConfigured[0].projectName} is claiming it — ` +
          `pick another port or run "berth unreserve ${port}".`,
      });
      reportedPorts.add(port);
      continue;
    }

    // Active/docker claimant on a reserved port whose owner isn't visible.
    const hasActive = claimants.some(isActivePort);
    const hasDocker = claimants.some(isDockerPort);
    const hasConfigured = claimants.some(isConfiguredPort);
    if ((hasActive || hasDocker) && !hasConfigured) {
      const who = hasActive ? claimants.find(isActivePort)! : null;
      const dockerWho = !who ? claimants.find(isDockerPort)! : null;
      const by = who
        ? `${who.process} (PID ${who.pid})`
        : `Docker container ${dockerWho!.containerName}`;
      conflicts.push({
        port,
        claimants,
        severity: 'warning',
        suggestion: `Port ${port} is reserved for "${reservation.project}" but currently held by ${by}.`,
      });
      reportedPorts.add(port);
    }
  }

  for (const [port, claimants] of portMap) {
    if (reportedPorts.has(port)) continue;
    if (claimants.length < 2) continue;

    const hasActive = claimants.some(isActivePort);
    const hasDocker = claimants.some(isDockerPort);
    const hasConfigured = claimants.some(isConfiguredPort);
    const configuredProjects = new Set(
      claimants.filter(isConfiguredPort).map((c) => c.projectDir),
    );

    let severity: 'error' | 'warning' = 'warning';
    let suggestion = '';

    if (hasActive && hasConfigured) {
      severity = 'error';
      const activeItem = claimants.find(isActivePort)!;
      suggestion = `Port ${port} is in use by ${activeItem.process} (PID ${activeItem.pid}). Kill it or reassign.`;
    } else if (hasDocker && hasConfigured) {
      severity = 'error';
      const dockerItem = claimants.find(isDockerPort)!;
      suggestion = `Port ${port} is used by Docker container ${dockerItem.containerName}. Stop it or remap.`;
    } else if (configuredProjects.size > 1) {
      severity = 'warning';
      suggestion = `Port ${port} is configured in ${configuredProjects.size} different projects. They cannot run simultaneously.`;
    } else if (hasActive && hasDocker) {
      severity = 'error';
      suggestion = `Port ${port} has both a system process and Docker container. One must be stopped.`;
    } else {
      continue; // Same project, same port — not really a conflict
    }

    conflicts.push({ port, claimants, severity, suggestion });
  }

  // Sort: errors first, then by port number
  conflicts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.port - b.port;
  });

  return conflicts;
}

export interface DetectAllConflictsInputs {
  active: ActivePort[];
  docker: DockerPort[];
  configured: ConfiguredPort[];
  reservations?: Reservation[];
  team?: TeamConfig;
}

/**
 * Aggregates every source of conflict berth knows about into one sorted list:
 *   1. detectConflicts over active / docker / configured (with reservations)
 *   2. team.reservedRanges violations via detectRangeViolations
 *   3. team.policies.onConflict: 'error' escalation
 *
 * Every command that reports conflicts should call this instead of detectConflicts
 * directly.
 */
export function detectAllConflicts(inputs: DetectAllConflictsInputs): Conflict[] {
  const base = detectConflicts(
    inputs.active,
    inputs.docker,
    inputs.configured,
    inputs.reservations ?? [],
  );

  const rangeViolations =
    inputs.team?.reservedRanges && inputs.team.reservedRanges.length > 0
      ? detectRangeViolations(
          inputs.configured,
          inputs.team.reservedRanges,
          inputs.team.assignments,
        )
      : [];

  const seen = new Set(base.map((c) => `${c.port}:${c.severity}`));
  const out = [...base];
  for (const c of rangeViolations) {
    if (!seen.has(`${c.port}:${c.severity}`)) out.push(c);
  }

  // team.policies.onConflict='error' escalates any warning-severity conflict.
  const policy = inputs.team?.policies?.onConflict;
  if (policy === 'error') {
    for (const c of out) {
      if (c.severity === 'warning') c.severity = 'error';
    }
  }

  out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.port - b.port;
  });
  return out;
}

export function mergePortInfo(
  active: ActivePort[],
  docker: DockerPort[],
  configured: ConfiguredPort[],
): PortInfo[] {
  const portMap = new Map<number, PortInfo>();

  for (const p of active) {
    const info = portMap.get(p.port) || { port: p.port, configured: [], status: 'free' as const };
    info.active = p;
    info.status = 'active';
    portMap.set(p.port, info);
  }

  for (const p of docker) {
    const info = portMap.get(p.port) || { port: p.port, configured: [], status: 'free' as const };
    info.docker = p;
    if (!info.active) info.status = 'docker';
    portMap.set(p.port, info);
  }

  for (const p of configured) {
    const info = portMap.get(p.port) || { port: p.port, configured: [], status: 'free' as const };
    info.configured.push(p);
    if (!info.active && !info.docker) info.status = 'configured';
    portMap.set(p.port, info);
  }

  return Array.from(portMap.values()).sort((a, b) => a.port - b.port);
}

// Why did the developer break up with port 3000?
// Because berth found out it was seeing three other projects behind their back.
