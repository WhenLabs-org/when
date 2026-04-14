import { shellExec, isDockerAvailable } from '../../utils/platform.js';
import type { DockerPort } from '../../types.js';

export async function detectDockerPorts(): Promise<DockerPort[]> {
  if (!(await isDockerAvailable())) return [];

  let result;
  try {
    result = await shellExec('docker', [
      'ps',
      '--format',
      '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}',
    ]);
  } catch {
    return [];
  }

  if (!result.stdout.trim()) return [];
  return parseDockerOutput(result.stdout);
}

export function parseDockerOutput(output: string): DockerPort[] {
  const lines = output.trim().split('\n');
  const ports: DockerPort[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 5) continue;

    const [containerId, containerName, image, portsStr, status] = parts;
    if (!portsStr || portsStr.trim() === '') continue;

    const mappings = portsStr.split(', ');
    for (const mapping of mappings) {
      const parsed = parsePortMapping(mapping.trim());
      if (!parsed) continue;

      ports.push({
        port: parsed.hostPort,
        containerPort: parsed.containerPort,
        containerId,
        containerName,
        image,
        protocol: parsed.protocol,
        status: status.split(' ')[0].toLowerCase(),
      });
    }
  }

  return ports;
}

interface ParsedMapping {
  hostPort: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
}

function parsePortMapping(mapping: string): ParsedMapping | null {
  // Formats:
  // 0.0.0.0:5432->5432/tcp
  // :::5432->5432/tcp
  // 5432/tcp (no host binding — skip)
  const match = mapping.match(/(?:[\d.]+|::)?:?(\d+)->(\d+)\/(tcp|udp)/);
  if (!match) return null;

  const hostPort = parseInt(match[1], 10);
  const containerPort = parseInt(match[2], 10);
  const protocol = match[3] as 'tcp' | 'udp';

  if (isNaN(hostPort) || isNaN(containerPort)) return null;

  return { hostPort, containerPort, protocol };
}
