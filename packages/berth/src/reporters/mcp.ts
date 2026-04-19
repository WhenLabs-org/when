import type {
  CheckOutput,
  Conflict,
  Resolution,
  StatusOutput,
} from '../types.js';

export interface McpEnvelope<T> {
  schema: string;
  data: T;
  hints: string[];
}

export function wrapStatus(status: StatusOutput): McpEnvelope<StatusOutput> {
  const hints = [
    ...conflictHints(status.conflicts),
    summaryHint(status.summary.activePorts, status.summary.dockerPorts, status.summary.configuredPorts),
  ];
  return { schema: 'berth/status.v1', data: status, hints };
}

export function wrapCheck(check: CheckOutput): McpEnvelope<CheckOutput> {
  const hints = [
    ...conflictHints(check.conflicts),
    ...resolutionHints(check.resolutions),
  ];
  if (hints.length === 0) {
    hints.push(`All ${check.scannedSources.length} source(s) clean — ready to start.`);
  }
  return { schema: 'berth/check.v1', data: check, hints };
}

function conflictHints(conflicts: Conflict[]): string[] {
  return conflicts.map((c) => `[${c.severity}] ${c.suggestion}`);
}

function resolutionHints(resolutions: Resolution[]): string[] {
  return resolutions.map((r) => {
    if (r.type === 'kill' && r.pid) {
      return `Run: kill ${r.pid}  (port ${r.port})`;
    }
    if (r.type === 'reassign' && r.targetPort) {
      return `Reassign: port ${r.port} → ${r.targetPort}`;
    }
    if (r.type === 'stop-service' && r.containerName) {
      return `Run: docker stop ${r.containerName}`;
    }
    return r.description;
  });
}

function summaryHint(active: number, docker: number, configured: number): string {
  return `Summary: ${active} active, ${docker} docker, ${configured} configured.`;
}
