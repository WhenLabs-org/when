import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runAllScans, type ScanRollup } from '../utils/scan-runner.js';

/** Per-tool entry in the whenlabs_summary rollup response. */
export interface ToolSummary {
  issues: number;
  warnings: number;
  status: ScanRollup['status'];
  detail: string;
}

/** Whole-project rollup returned by the whenlabs_summary MCP tool and by
 *  `when doctor --brief`. Keyed by scanner name (stale, envalid, berth,
 *  vow, aware). */
export interface WhenlabsSummary {
  tools: Record<string, ToolSummary>;
  /** 'error' if any tool has issues or errored, 'warning' if only warnings,
   *  'clean' otherwise (including when every tool skipped). */
  worst_severity: 'clean' | 'warning' | 'error';
  total_issues: number;
  total_warnings: number;
}

/** Pure projection from the ScanRollup[] scan-runner produces into the
 *  compact WhenlabsSummary shape exposed on the MCP wire. Separated from
 *  the tool registration so it can be unit-tested without spinning up the
 *  MCP server. */
export function buildWhenlabsSummary(results: ScanRollup[]): WhenlabsSummary {
  const tools: Record<string, ToolSummary> = {};
  for (const r of results) {
    tools[r.name] = {
      issues: r.issues,
      warnings: r.warnings,
      status: r.status,
      detail: r.detail,
    };
  }

  const totalIssues = results.reduce((sum, r) => sum + r.issues, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings, 0);
  const hasErrors = results.some(r => r.status === 'issues' || r.status === 'error');

  const worstSeverity: WhenlabsSummary['worst_severity'] =
    hasErrors ? 'error'
    : totalWarnings > 0 ? 'warning'
    : 'clean';

  return {
    tools,
    worst_severity: worstSeverity,
    total_issues: totalIssues,
    total_warnings: totalWarnings,
  };
}

export function registerSummaryTool(server: McpServer): void {
  server.tool(
    'whenlabs_summary',
    [
      'Return a compact rollup of the current state of every WhenLabs scanner (stale, envalid, berth, vow, aware) in a single call — issue counts, warning counts, and a one-line human-readable detail for each.',
      '',
      'When to use: at session start, or whenever the agent needs an at-a-glance picture of project health without running each scanner individually. Far cheaper than five tool calls; the scan layer parallelizes internally.',
      '',
      'Side effects: runs the same read-only scans that power `when doctor`. No writes, no network (except the vow license cache, which is already opt-in). Completes in well under a second on most repos.',
      '',
      'Returns: JSON with `tools` (per-scanner `{ issues, warnings, status, detail }`), `worst_severity` (`clean` | `warning` | `error`), `total_issues`, and `total_warnings`. `status` is one of `ok`, `issues`, `error`, `skipped` — matching the doctor report semantics.',
    ].join('\n'),
    {
      path: z.string().optional().describe('Absolute or relative path to the project root to scan. Defaults to the current working directory.'),
    },
    async (input) => {
      const cwd = (input.path as string | undefined) ?? process.cwd();
      const results = await runAllScans(cwd);
      const summary = buildWhenlabsSummary(results);
      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );
}
