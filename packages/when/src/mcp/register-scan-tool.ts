import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanOptions, Tool, ScanResult } from '@whenlabs/core';
import { z } from 'zod';
import { writeCache, deriveProject, checkTriggers } from './run-cli.js';
import { formatScanResult } from './format-scan.js';

// Scan outputs on large repos can be thousands of findings. Without a cap,
// a single tool call can return hundreds of KB of text, bust MCP client
// budgets, and drown the model in noise. Default to a sane page size and
// hard-truncate the rendered string as a last line of defense.
const DEFAULT_LIMIT = 200;
const MAX_BYTES = 100_000;

export interface ScanToolSpec {
  /** MCP tool name, e.g. "vow_scan". */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Child-package Tool instance to invoke. */
  tool: Tool;
  /** Cache file key override — defaults to `name`. */
  cacheName?: string;
  /** Optional extra zod schema fields merged with `{path, format}`. */
  extraSchema?: Record<string, z.ZodTypeAny>;
  buildOptions?: (input: Record<string, unknown>) => Record<string, unknown> | undefined;
  formatValues?: [string, ...string[]];
  coerceFormat?: (format: string | undefined) => 'terminal' | 'json' | 'markdown' | undefined;
}

function paginateFindings(scan: ScanResult, limit: number, offset: number): ScanResult {
  const total = scan.findings.length;
  const start = Math.max(0, Math.min(offset, total));
  const end = Math.min(total, start + Math.max(1, limit));
  return { ...scan, findings: scan.findings.slice(start, end) };
}

function paginationFooter(total: number, limit: number, offset: number): string {
  if (total <= limit && offset === 0) return '';
  const shown = Math.max(0, Math.min(total, offset + limit) - offset);
  const nextOffset = offset + shown;
  const parts = [
    `Showing ${shown} of ${total} findings (offset=${offset}, limit=${limit}).`,
  ];
  if (nextOffset < total) {
    parts.push(`Next page: call again with offset=${nextOffset}.`);
  }
  return `\n\n${parts.join(' ')}`;
}

function capBytes(output: string): string {
  if (output.length <= MAX_BYTES) return output;
  const extra = output.length - MAX_BYTES;
  return `${output.slice(0, MAX_BYTES)}\n\n… [truncated ${extra} bytes — narrow the scope with path= or raise offset=]`;
}

export function registerScanTool(server: McpServer, spec: ScanToolSpec): void {
  const baseSchema: Record<string, z.ZodTypeAny> = {
    path: z.string().optional().describe('Project directory (defaults to cwd)'),
    format: z
      .enum(spec.formatValues ?? ['terminal', 'json'])
      .optional()
      .describe('Output format'),
    limit: z
      .coerce.number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe(`Max findings to return (default: ${DEFAULT_LIMIT})`),
    offset: z
      .coerce.number()
      .int()
      .min(0)
      .optional()
      .describe('Skip the first N findings (for paging large scans)'),
    ...(spec.extraSchema ?? {}),
  };

  server.tool(spec.name, spec.description, baseSchema, async (input: Record<string, unknown>) => {
    const path = input.path as string | undefined;
    const format = input.format as string | undefined;
    const limit = (input.limit as number | undefined) ?? DEFAULT_LIMIT;
    const offset = (input.offset as number | undefined) ?? 0;
    const renderFormat = spec.coerceFormat ? spec.coerceFormat(format) : (format as 'terminal' | 'json' | 'markdown' | undefined);

    const scanOpts: ScanOptions = { cwd: path };
    const options = spec.buildOptions?.(input);
    if (options !== undefined) scanOpts.options = options;

    const scan = await spec.tool.scan(scanOpts);
    const total = scan.findings.length;
    const paged = paginateFindings(scan, limit, offset);
    const rendered = formatScanResult(paged, renderFormat);
    const footer = renderFormat === 'json' ? '' : paginationFooter(total, limit, offset);
    const output = capBytes(rendered + footer);

    const code = scan.ok ? 0 : 1;
    writeCache(spec.cacheName ?? spec.name, deriveProject(path), output, code);
    const extras = await checkTriggers(spec.name, { stdout: output, stderr: '', code }, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  });
}
