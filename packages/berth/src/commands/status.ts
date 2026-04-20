import type { GlobalOptions, StatusOutput } from '../types.js';
import { detectAllActive } from '../detectors/index.js';
import { detectAllConflicts } from '../resolver/conflicts.js';
import { renderStatus } from '../reporters/terminal.js';
import { formatJson } from '../reporters/json.js';
import { wrapStatus } from '../reporters/mcp.js';
import { detectEnvironment } from '../utils/environment.js';

export interface StatusCommandOptions extends GlobalOptions {
  trace?: boolean;
  mcp?: boolean;
}

export async function statusCommand(options: StatusCommandOptions): Promise<void> {
  const { ports: active, docker, warnings: activeWarnings } = await detectAllActive({
    trace: options.trace,
  });

  const conflicts = detectAllConflicts({ active, docker, configured: [] });
  const environment = await detectEnvironment();

  const output: StatusOutput = {
    active,
    docker,
    configured: [],
    conflicts,
    environment,
    summary: {
      activePorts: active.length,
      dockerPorts: docker.length,
      configuredPorts: 0,
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
      for (const w of activeWarnings) {
        console.error(`Warning: ${w}`);
      }
    }
  }
}
