import { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { type ToolResult, runAllChecks } from '../utils/tool-runner.js';
import { type WatchStatus, type ToolStatus, getStatusPath } from '../utils/status-provider.js';

const STATUS_DIR = join(homedir(), '.whenlabs');

function toolResultToStatus(r: ToolResult): ToolStatus {
  const count = r.issues + r.warnings;
  if (r.status === 'error') {
    return { status: 'error', count, detail: r.detail };
  }
  if (r.status === 'issues') {
    return { status: 'issues', count, detail: r.detail };
  }
  return { status: 'ok', count: 0, detail: r.detail };
}

function buildSummary(results: ToolResult[]): string {
  const map: Record<string, ToolResult> = {};
  for (const r of results) map[r.name] = r;

  const stalePart = `stale:${map['stale']?.issues ?? 0}`;
  const envPart = `env:${(map['envalid']?.issues ?? 0) + (map['envalid']?.warnings ?? 0)}`;
  const portsPart = `ports:${map['berth']?.issues ?? 0}`;
  const licPart = `lic:${(map['vow']?.issues ?? 0) + (map['vow']?.warnings ?? 0)}`;
  const awarePart = `aware:${map['aware']?.status === 'ok' || map['aware']?.status === 'skipped' ? 'ok' : 'stale'}`;

  return `${stalePart} ${envPart} ${portsPart} ${licPart} ${awarePart}`;
}

function writeStatus(results: ToolResult[]): void {
  mkdirSync(STATUS_DIR, { recursive: true });

  const toolsMap: Record<string, ToolResult> = {};
  for (const r of results) toolsMap[r.name] = r;

  const status: WatchStatus = {
    timestamp: new Date().toISOString(),
    tools: {
      stale: toolResultToStatus(toolsMap['stale']!),
      envalid: toolResultToStatus(toolsMap['envalid']!),
      berth: toolResultToStatus(toolsMap['berth']!),
      vow: toolResultToStatus(toolsMap['vow']!),
      aware: toolResultToStatus(toolsMap['aware']!),
    },
    summary: buildSummary(results),
  };

  writeFileSync(getStatusPath(), JSON.stringify(status, null, 2) + '\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWatchCommand(): Command {
  const cmd = new Command('watch');
  cmd.description('Run all 5 CLI tools on a schedule and write results to ~/.whenlabs/status.json (velocity is embedded and always-on — it does not participate in scheduled scans)');
  cmd.option('--once', 'Run a single scan and exit');
  cmd.option('--interval <seconds>', 'Override the default scan interval (seconds)', '60');

  cmd.action(async (options: { once?: boolean; interval?: string }) => {
    const cwd = process.cwd();
    const intervalSec = Math.max(10, parseInt(options.interval ?? '60', 10));
    let stopped = false;

    const shutdown = () => {
      stopped = true;
      process.stderr.write('\nwatch: shutting down gracefully\n');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    const runScan = async (): Promise<boolean> => {
      const start = Date.now();
      process.stderr.write(`watch: scanning... `);

      const results = await runAllChecks(cwd);
      writeStatus(results);

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const summary = buildSummary(results);
      process.stderr.write(`done in ${elapsed}s  [${summary}]\n`);

      const hasIssues = results.some(r => r.status === 'issues' || r.status === 'error');
      return hasIssues;
    };

    if (options.once) {
      const hasIssues = await runScan();
      process.exit(hasIssues ? 1 : 0);
      return;
    }

    process.stderr.write(`watch: started (interval=${intervalSec}s, status=${getStatusPath()})\n`);

    while (!stopped) {
      await runScan();

      // Wait for the interval, checking stopped flag every second
      for (let i = 0; i < intervalSec && !stopped; i++) {
        await sleep(1000);
      }
    }
  });

  return cmd;
}
