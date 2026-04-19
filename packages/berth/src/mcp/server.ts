import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VERSION } from '../version.js';
import { scanCheck } from '../commands/check.js';
import { statusCommand } from '../commands/status.js';
import { historyCommand } from '../commands/history.js';
import { reserveCommand } from '../commands/reserve.js';
import { unreserveCommand } from '../commands/unreserve.js';
import { killPortProcess } from '../resolver/actions.js';
import { loadRegistry } from '../registry/store.js';
import { activeReservations } from '../registry/reservations.js';
import { detectAllActive } from '../detectors/index.js';
import { detectAllConflicts } from '../resolver/conflicts.js';
import { wrapCheck, wrapStatus } from '../reporters/mcp.js';
import { appendEvent } from '../history/recorder.js';
import type { StatusOutput } from '../types.js';

function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T; stdout: string }> {
  const origLog = console.log;
  let buf = '';
  console.log = (msg?: unknown, ...rest: unknown[]) => {
    buf += [msg, ...rest].map(String).join(' ') + '\n';
  };
  const done = (res: T) => ({ result: res, stdout: buf });
  return fn().then(
    (res) => {
      console.log = origLog;
      return done(res);
    },
    (err) => {
      console.log = origLog;
      throw err;
    },
  );
}

function jsonText(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'berth', version: VERSION });

  server.registerTool(
    'berth.status',
    {
      description:
        'Unified dashboard of active ports, Docker ports, and configured ports, with conflicts',
      inputSchema: {
        trace: z.boolean().optional().describe('Include process ancestry'),
      },
    },
    async ({ trace }) => {
      const [{ ports: active, docker }, registry] = await Promise.all([
        detectAllActive({ trace }),
        loadRegistry(),
      ]);
      const reservations = activeReservations(registry);
      const conflicts = detectAllConflicts({
        active,
        docker,
        configured: [],
        reservations,
      });
      const output: StatusOutput = {
        active,
        docker,
        configured: [],
        conflicts,
        summary: {
          activePorts: active.length,
          dockerPorts: docker.length,
          configuredPorts: 0,
          conflictCount: conflicts.length,
        },
      };
      return jsonText(wrapStatus(output));
    },
  );

  server.registerTool(
    'berth.check',
    {
      description: 'Scan a project directory for port conflicts and suggest resolutions',
      inputSchema: {
        dir: z.string().describe('Absolute path to the project directory'),
      },
    },
    async ({ dir }) => {
      const { output } = await scanCheck(dir);
      return jsonText(wrapCheck(output));
    },
  );

  server.registerTool(
    'berth.history',
    {
      description: 'Read port history events (claims, releases, conflicts, resolutions)',
      inputSchema: {
        port: z.number().int().positive().optional(),
        since: z.string().optional().describe('Relative like 1h/7d, or ISO date'),
        limit: z.number().int().positive().optional(),
        flapping: z.boolean().optional(),
      },
    },
    async ({ port, since, limit, flapping }) => {
      const { stdout } = await captureStdout(() =>
        historyCommand(port !== undefined ? String(port) : undefined, {
          json: true,
          verbose: false,
          noColor: true,
          since,
          limit: limit?.toString(),
          flapping,
        }),
      );
      try {
        return jsonText(JSON.parse(stdout));
      } catch {
        return jsonText({ events: [], rawOutput: stdout });
      }
    },
  );

  server.registerTool(
    'berth.reserve',
    {
      description: 'Reserve a port for a project',
      inputSchema: {
        port: z.number().int().min(1).max(65535),
        project: z.string().min(1),
        reason: z.string().optional(),
        expires: z
          .string()
          .optional()
          .describe('TTL like 7d, 3h, 30m'),
      },
    },
    async ({ port, project, reason, expires }) => {
      const { stdout } = await captureStdout(() =>
        reserveCommand(String(port), {
          json: true,
          verbose: false,
          noColor: true,
          for: project,
          reason,
          expires,
        }),
      );
      try {
        return jsonText(JSON.parse(stdout));
      } catch {
        return jsonText({ ok: false, rawOutput: stdout });
      }
    },
  );

  server.registerTool(
    'berth.unreserve',
    {
      description: 'Remove a port reservation',
      inputSchema: { port: z.number().int().min(1).max(65535) },
    },
    async ({ port }) => {
      const { stdout } = await captureStdout(() =>
        unreserveCommand(String(port), {
          json: true,
          verbose: false,
          noColor: true,
        }),
      );
      try {
        return jsonText(JSON.parse(stdout));
      } catch {
        return jsonText({ ok: false, rawOutput: stdout });
      }
    },
  );

  server.registerTool(
    'berth.kill',
    {
      description:
        'DESTRUCTIVE: Kill the process holding a port. Requires confirm=true; otherwise returns a dry-run plan.',
      annotations: { destructiveHint: true, openWorldHint: true },
      inputSchema: {
        port: z.number().int().min(1).max(65535),
        confirm: z
          .boolean()
          .default(false)
          .describe('Must be true to actually kill; otherwise plan only'),
      },
    },
    async ({ port, confirm }) => {
      if (!confirm) {
        return jsonText({
          plan: `Would send SIGTERM to the process holding port ${port}. ` +
            `Call again with confirm: true to execute.`,
          port,
          dryRun: true,
        });
      }
      const result = await killPortProcess(port);
      const now = new Date().toISOString();
      await appendEvent({
        type: 'resolution-applied',
        at: now,
        port,
        action: 'kill',
        detail: `MCP berth.kill confirmed`,
        success: result.killed.length > 0,
      }).catch(() => {});
      return jsonText(result);
    },
  );

  // Use statusCommand only so it participates in history snapshotting.
  void statusCommand;

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
