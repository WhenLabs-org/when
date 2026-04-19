import type { Conflict, Resolution, ActivePort, DockerPort, ConfiguredPort } from '../types.js';
import { findFreePort } from '../utils/ports.js';
import { isDevProcess } from '../utils/process.js';

export async function suggestResolutions(conflict: Conflict): Promise<Resolution[]> {
  const resolutions: Resolution[] = [];
  const activePorts = conflict.claimants.filter(
    (c): c is ActivePort => 'pid' in c && 'source' in c && (c.source === 'lsof' || c.source === 'netstat'),
  );
  const dockerPorts = conflict.claimants.filter(
    (c): c is DockerPort => 'containerId' in c,
  );
  const configuredPorts = conflict.claimants.filter(
    (c): c is ConfiguredPort => 'projectDir' in c && 'confidence' in c,
  );

  // Suggest killing dev processes
  for (const active of activePorts) {
    if (isDevProcess(active)) {
      resolutions.push({
        type: 'kill',
        description: `Kill ${active.process} (PID ${active.pid}) on port ${conflict.port}`,
        port: conflict.port,
        pid: active.pid,
        automatic: true,
      });
    } else {
      resolutions.push({
        type: 'stop-service',
        description: `Stop system service ${active.process} (PID ${active.pid}) on port ${conflict.port}`,
        port: conflict.port,
        pid: active.pid,
        automatic: false,
      });
    }
  }

  // Suggest stopping Docker containers
  for (const docker of dockerPorts) {
    resolutions.push({
      type: 'remap-docker',
      description: `Stop or remap Docker container ${docker.containerName} from port ${conflict.port}`,
      port: conflict.port,
      containerName: docker.containerName,
      automatic: false,
    });
  }

  // Suggest reassigning configured ports to next free port
  for (const configured of configuredPorts) {
    try {
      const altPort = await findFreePort(conflict.port + 1, [conflict.port]);
      resolutions.push({
        type: 'reassign',
        description: `Reassign ${configured.projectName} from port ${conflict.port} to ${altPort}`,
        port: conflict.port,
        targetPort: altPort,
        projectName: configured.projectName,
        automatic: true,
      });
    } catch {
      // Could not find a free port
    }
  }

  return resolutions;
}

export async function suggestAlternativePort(
  port: number,
  exclude: number[] = [],
): Promise<number> {
  return findFreePort(port + 1, [port, ...exclude]);
}
