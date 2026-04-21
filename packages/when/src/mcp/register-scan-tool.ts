import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanOptions, Tool } from '@whenlabs/core';
import { z } from 'zod';
import { writeCache } from './run-cli.js';
import { detectProjectDirName } from '../utils/detect-project.js';
import { formatScanResult } from './format-scan.js';

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

export function registerScanTool(server: McpServer, spec: ScanToolSpec): void {
  const baseSchema: Record<string, z.ZodTypeAny> = {
    path: z.string().optional().describe('Absolute or relative path to the project root to scan. Defaults to the current working directory.'),
    format: z
      .enum(spec.formatValues ?? ['terminal', 'json'])
      .optional()
      .describe('Response format: "terminal" for human-readable ANSI-colored output, "json" for machine-parseable structured data, "markdown" for rendered tables (where supported). Defaults to "terminal".'),
    ...(spec.extraSchema ?? {}),
  };

  server.tool(spec.name, spec.description, baseSchema, async (input: Record<string, unknown>) => {
    const path = input.path as string | undefined;
    const format = input.format as string | undefined;
    const renderFormat = spec.coerceFormat ? spec.coerceFormat(format) : (format as 'terminal' | 'json' | 'markdown' | undefined);

    const scanOpts: ScanOptions = { cwd: path };
    const options = spec.buildOptions?.(input);
    if (options !== undefined) scanOpts.options = options;

    const scan = await spec.tool.scan(scanOpts);
    const output = formatScanResult(scan, renderFormat);
    const code = scan.ok ? 0 : 1;
    writeCache(spec.cacheName ?? spec.name, detectProjectDirName(path), output, code);
    return { content: [{ type: 'text' as const, text: output }] };
  });
}
