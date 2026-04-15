import type { ActivePort, DockerPort, ConfiguredPort, Conflict, PortInfo } from '../types.js';

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

  const conflicts: Conflict[] = [];

  for (const [port, claimants] of portMap) {
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
