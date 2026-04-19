import { createTool as createStaleTool } from '@whenlabs/stale';
import { createTool as createEnvalidTool } from '@whenlabs/envalid';
import { createTool as createBerthTool } from '@whenlabs/berth';
import { createTool as createVowTool } from '@whenlabs/vow';
import { createTool as createAwareTool } from '@whenlabs/aware';
import type { ScanResult, Tool } from '@whenlabs/core';

export interface ToolResult {
  name: string;
  label: string;
  issues: number;
  warnings: number;
  status: 'ok' | 'issues' | 'error' | 'skipped';
  detail: string;
  exitCode: number;
}

interface Adapter {
  name: string;
  label: string;
  tool: Tool;
  okDetail: (r: ScanResult) => string;
  skipCheck?: (r: ScanResult) => string | null;
}

const ADAPTERS: Adapter[] = [
  {
    name: 'stale',
    label: 'stale scan',
    tool: createStaleTool(),
    okDetail: () => 'No documentation drift detected',
  },
  {
    name: 'envalid',
    label: 'envalid validate',
    tool: createEnvalidTool(),
    okDetail: () => '.env is valid',
    skipCheck: (r) =>
      r.findings.find((f) => f.ruleId === 'schema-not-found')
        ? 'No .env.schema found — run `envalid init`'
        : null,
  },
  {
    name: 'berth',
    label: 'berth check',
    tool: createBerthTool(),
    okDetail: () => 'No port conflicts',
  },
  {
    name: 'vow',
    label: 'vow scan',
    tool: createVowTool(),
    okDetail: (r) => {
      const total = r.summary.total;
      return total === 0 ? 'No packages found' : `${total} packages, all permissive`;
    },
  },
  {
    name: 'aware',
    label: 'aware doctor',
    tool: createAwareTool(),
    okDetail: (r) => `${r.summary.total} check(s) passed`,
  },
];

async function runAdapter(adapter: Adapter, cwd: string): Promise<ToolResult> {
  try {
    const scan = await adapter.tool.scan({ cwd });
    const skipReason = adapter.skipCheck?.(scan);
    if (skipReason) {
      return {
        name: adapter.name,
        label: adapter.label,
        issues: 0,
        warnings: 0,
        status: 'skipped',
        detail: skipReason,
        exitCode: 0,
      };
    }
    const errors = scan.summary.errors;
    const warnings = scan.summary.warnings;
    const status: ToolResult['status'] = errors > 0 || warnings > 0 ? 'issues' : 'ok';
    const detail =
      status === 'ok'
        ? adapter.okDetail(scan)
        : `${errors} error(s), ${warnings} warning(s)`;
    return {
      name: adapter.name,
      label: adapter.label,
      issues: errors,
      warnings,
      status,
      detail,
      exitCode: scan.ok ? 0 : 1,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: adapter.name,
      label: adapter.label,
      issues: 1,
      warnings: 0,
      status: 'error',
      detail: message.slice(0, 200),
      exitCode: 1,
    };
  }
}

export async function runAllChecks(cwd: string): Promise<ToolResult[]> {
  return Promise.all(ADAPTERS.map((a) => runAdapter(a, cwd)));
}
