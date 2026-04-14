import type { GlobalOptions, StatusOutput } from '../types.js';
import { detectAllActive, detectAllConfigured } from '../detectors/index.js';
import { detectConflicts } from '../resolver/conflicts.js';
import { loadRegistry } from '../registry/store.js';
import { renderStatus } from '../reporters/terminal.js';
import { formatJson } from '../reporters/json.js';

export async function statusCommand(options: GlobalOptions): Promise<void> {
  const [{ ports: active, docker, warnings: activeWarnings }, registry] = await Promise.all([
    detectAllActive(),
    loadRegistry(),
  ]);

  // Scan all registered project dirs for configured ports
  const allConfigured = [];
  const configWarnings: string[] = [];
  for (const project of Object.values(registry.projects)) {
    try {
      const { ports, warnings } = await detectAllConfigured(project.directory);
      allConfigured.push(...ports);
      configWarnings.push(...warnings);
    } catch {
      configWarnings.push(`Failed to scan ${project.directory}`);
    }
  }

  const conflicts = detectConflicts(active, docker, allConfigured);

  const output: StatusOutput = {
    active,
    docker,
    configured: allConfigured,
    conflicts,
    summary: {
      activePorts: active.length,
      dockerPorts: docker.length,
      configuredPorts: allConfigured.length,
      conflictCount: conflicts.length,
    },
  };

  if (options.json) {
    console.log(formatJson(output));
  } else {
    console.log(renderStatus(output));
    if (options.verbose) {
      for (const w of [...activeWarnings, ...configWarnings]) {
        console.error(`Warning: ${w}`);
      }
    }
  }
}
