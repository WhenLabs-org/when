import type {
  Finding,
  ScanOptions,
  ScanResult,
  Severity,
  Tool,
} from '@whenlabs/core';
import { schemaVersion } from '@whenlabs/core';
import { scanCheck } from './commands/check.js';
import type { Conflict, ConfiguredPort } from './types.js';

const TOOL_NAME = 'berth';

// Phase 2 red flag (carried forward for integration): berth surfaces both
// "state" (the active/docker/configured port tables) AND "findings" (conflicts).
// The @whenlabs/core contract only models findings. We map each Conflict to a
// single Finding with the conflict payload in `data`, and preserve the full
// state snapshot (active + docker + configured + CheckOutput) under
// `ScanResult.raw` so callers that need to render the active-port table can
// read it without re-running the scan.

function conflictToFinding(conflict: Conflict): Finding {
  const severity: Severity = conflict.severity === 'error' ? 'error' : 'warning';
  const configuredClaimant = conflict.claimants.find(
    (c): c is ConfiguredPort => 'projectDir' in c && 'confidence' in c,
  );

  const location = configuredClaimant
    ? {
        file: configuredClaimant.sourceFile,
        line: configuredClaimant.sourceLine,
        snippet: configuredClaimant.context,
      }
    : undefined;

  return {
    tool: TOOL_NAME,
    ruleId: 'port-conflict',
    severity,
    message: `Port ${conflict.port} conflict: ${conflict.suggestion}`,
    suggestion: conflict.suggestion,
    location,
    data: {
      port: conflict.port,
      claimants: conflict.claimants,
    },
  };
}

export function createTool(): Tool {
  return {
    name: TOOL_NAME,
    description: 'Port & process conflict resolver for developers',
    async scan(opts?: ScanOptions): Promise<ScanResult> {
      const startedAt = new Date();
      const cwd = opts?.cwd ?? process.cwd();
      const { output, active, docker, warnings } = await scanCheck(cwd);

      const findings = output.conflicts.map(conflictToFinding);
      const errors = findings.filter((f) => f.severity === 'error').length;
      const warningsCount = findings.filter((f) => f.severity === 'warning').length;
      const infos = findings.filter((f) => f.severity === 'info').length;

      const configuredPorts = output.scannedSources.reduce((n, s) => n + s.portsFound, 0);

      return {
        schemaVersion,
        tool: TOOL_NAME,
        ok: errors === 0,
        project: {
          name: output.project,
          cwd: output.directory,
          detectedStack: [],
        },
        findings,
        summary: {
          total: findings.length,
          errors,
          warnings: warningsCount,
          infos,
          extra: {
            activePorts: active.length,
            dockerPorts: docker.length,
            configuredPorts,
            scannedSources: output.scannedSources.length,
            detectionWarnings: warnings,
          },
        },
        timing: {
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
        },
        raw: {
          output,
          active,
          docker,
          warnings,
        },
      };
    },
  };
}

