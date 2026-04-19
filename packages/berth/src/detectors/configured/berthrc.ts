import path from 'node:path';
import type { BerthConfig, ConfiguredPort } from '../../types.js';

/**
 * Emit ConfiguredPort entries for every port declared in a loaded berth config.
 * These are authoritative and always high-confidence.
 */
export async function detectFromBerthConfig(
  dir: string,
  config: BerthConfig,
): Promise<ConfiguredPort[]> {
  const ports: ConfiguredPort[] = [];
  if (!config.ports) return ports;

  const projectName = config.projectName ?? path.basename(dir);
  const sourceFile = path.join(dir, 'berth.config');

  for (const [name, raw] of Object.entries(config.ports)) {
    const port = typeof raw === 'number' ? raw : raw.port;
    const description = typeof raw === 'number' ? name : raw.description ?? name;
    ports.push({
      port,
      source: 'berthrc',
      sourceFile,
      context: `${name}: ${description}`,
      projectDir: dir,
      projectName,
      confidence: 'high',
    });
  }

  return ports;
}
