import { describe, it, expect } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MCP_ENTRY = resolve(__dirname, '..', '..', 'dist', 'mcp.js');

// The 8 tools the umbrella MCP server is contracted to expose.
// Adding or removing tools here is a public-API change — update deliberately.
const EXPECTED_TOOLS = [
  'velocity_start_task',
  'velocity_end_task',
  'stale_scan',
  'envalid_validate',
  'berth_check',
  'aware_sync',
  'vow_scan',
  'whenlabs_summary',
].sort();

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolsListResult {
  tools: Array<{ name: string; description?: string }>;
}

function send(child: ChildProcessWithoutNullStreams, msg: unknown): void {
  child.stdin.write(JSON.stringify(msg) + '\n');
}

function waitForResponse(
  child: ChildProcessWithoutNullStreams,
  id: number,
  timeoutMs: number,
): Promise<JsonRpcResponse> {
  return new Promise((resolveResponse, rejectResponse) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      rejectResponse(new Error(`Timed out after ${timeoutMs}ms waiting for response id=${id}`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          if (parsed.id === id) {
            cleanup();
            resolveResponse(parsed);
            return;
          }
        } catch {
          // Not a JSON-RPC frame — ignore (could be a log line from a dep).
        }
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
    };

    child.stdout.on('data', onData);
  });
}

describe('MCP stdio smoke', () => {
  it('starts, responds to initialize, and lists all 8 expected tools', async () => {
    if (!existsSync(MCP_ENTRY)) {
      throw new Error(
        `Build output missing at ${MCP_ENTRY} — run \`pnpm -r build\` before tests.`,
      );
    }

    // Point velocity's sqlite db at a temp dir so the test doesn't touch the user's home.
    const tmpHome = mkdtempSync(join(tmpdir(), 'when-mcp-smoke-'));

    const child = spawn('node', [MCP_ENTRY], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    });

    try {
      // Capture stderr only for failure diagnostics.
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolveExit) => {
          child.on('exit', (code, signal) => resolveExit({ code, signal }));
        },
      );

      send(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'when-smoke-test', version: '0.0.0' },
        },
      });

      const initResp = await waitForResponse(child, 1, 15_000).catch((err: Error) => {
        throw new Error(
          `initialize failed: ${err.message}\nMCP server stderr:\n${stderr || '(empty)'}`,
        );
      });
      expect(initResp.error, `initialize returned error: ${JSON.stringify(initResp.error)}`).toBeUndefined();
      expect(initResp.result).toBeDefined();

      send(child, { jsonrpc: '2.0', method: 'notifications/initialized' });

      send(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const listResp = await waitForResponse(child, 2, 15_000).catch((err: Error) => {
        throw new Error(
          `tools/list failed: ${err.message}\nMCP server stderr:\n${stderr || '(empty)'}`,
        );
      });
      expect(listResp.error).toBeUndefined();
      const { tools } = listResp.result as ToolsListResult;
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(EXPECTED_TOOLS);

      // Ensure server stays alive and didn't crash mid-handshake.
      expect(child.exitCode).toBeNull();

      child.kill('SIGTERM');
      await exitPromise;
    } finally {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
      rmSync(tmpHome, { recursive: true, force: true });
    }
  }, 30_000);
});
