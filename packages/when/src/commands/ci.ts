import { spawn } from 'node:child_process';
import { buildSpawn } from '../utils/find-bin.js';

interface ToolResult {
  tool: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  issues: number;
}

interface CiResult {
  tool: string;
  status: 'pass' | 'fail' | 'skip';
  exitCode: number;
  issues: number;
  error?: string;
}

function runTool(bin: string, args: string[]): Promise<ToolResult> {
  return new Promise((resolve) => {
    const s = buildSpawn(bin);
    let stdout = '';
    let stderr = '';

    const child = spawn(s.cmd, [...s.args, ...args], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: s.shell,
    });

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('error', (err) => {
      resolve({ tool: bin, exitCode: 1, stdout, stderr: err.message, issues: 0 });
    });

    child.on('exit', (code) => {
      resolve({ tool: bin, exitCode: code ?? 1, stdout, stderr, issues: 0 });
    });
  });
}

function countIssues(tool: string, stdout: string, exitCode: number): number {
  if (exitCode === 0) return 0;
  // Try to extract issue counts from JSON output
  try {
    const data = JSON.parse(stdout);
    if (Array.isArray(data)) return data.length;
    if (typeof data.issues === 'number') return data.issues;
    if (typeof data.errors === 'number') return data.errors;
    if (Array.isArray(data.errors)) return data.errors.length;
    if (Array.isArray(data.violations)) return data.violations.length;
    if (Array.isArray(data.blocked)) return data.blocked.length;
  } catch {
    // Not JSON — just flag as 1 issue
  }
  return exitCode !== 0 ? 1 : 0;
}

function emitGitHubAnnotation(tool: string, message: string, level: 'error' | 'warning' = 'error'): void {
  // GitHub Actions annotation format: ::error file=X,line=Y::message
  const sanitized = message.replace(/\n/g, '%0A').replace(/\r/g, '%0D');
  console.log(`::${level} file=${tool}::${sanitized}`);
}

function printTable(results: CiResult[]): void {
  const colWidths = { tool: 10, status: 8, issues: 8 };
  const sep = `+${'─'.repeat(colWidths.tool + 2)}+${'─'.repeat(colWidths.status + 2)}+${'─'.repeat(colWidths.issues + 2)}+`;
  const row = (tool: string, status: string, issues: string) =>
    `| ${tool.padEnd(colWidths.tool)} | ${status.padEnd(colWidths.status)} | ${issues.padEnd(colWidths.issues)} |`;

  console.log('');
  console.log('WhenLabs CI Results');
  console.log(sep);
  console.log(row('Tool', 'Status', 'Issues'));
  console.log(sep);
  for (const r of results) {
    const statusStr = r.status === 'pass' ? 'pass' : r.status === 'skip' ? 'skip' : 'FAIL';
    console.log(row(r.tool, statusStr, r.status === 'skip' ? '-' : String(r.issues)));
  }
  console.log(sep);
  console.log('');
}

export async function ci(options: { ci: boolean; json: boolean }): Promise<void> {
  const tools: Array<{ name: string; bin: string; args: string[] }> = [
    { name: 'stale', bin: 'stale', args: ['scan', '-f', 'json'] },
    { name: 'envalid', bin: 'envalid', args: ['validate', '-f', 'json'] },
    { name: 'vow', bin: 'vow', args: ['check', '-f', 'json'] },
  ];

  const results: CiResult[] = [];

  for (const tool of tools) {
    const raw = await runTool(tool.bin, tool.args);
    const issueCount = countIssues(tool.name, raw.stdout, raw.exitCode);

    let status: 'pass' | 'fail' | 'skip' = 'pass';
    if (raw.exitCode === 127) {
      status = 'skip';
    } else if (raw.exitCode !== 0) {
      status = 'fail';
    }

    results.push({
      tool: tool.name,
      status,
      exitCode: raw.exitCode,
      issues: issueCount,
      error: raw.exitCode !== 0 && raw.exitCode !== 127
        ? (raw.stderr || raw.stdout).split('\n')[0]
        : undefined,
    });

    // Emit GitHub Actions annotations for failures
    if (options.ci && status === 'fail') {
      const lines = (raw.stdout + '\n' + raw.stderr).trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          emitGitHubAnnotation(tool.name, line.trim(), 'error');
        }
      }
    }
  }

  const hasFailures = results.some((r) => r.status === 'fail');

  if (options.json) {
    const output = {
      passed: !hasFailures,
      tools: results.map((r) => ({
        tool: r.tool,
        status: r.status,
        exitCode: r.exitCode,
        issues: r.issues,
        ...(r.error ? { error: r.error } : {}),
      })),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    printTable(results);

    if (hasFailures) {
      const failed = results.filter((r) => r.status === 'fail').map((r) => r.tool);
      console.error(`CI failed: issues found in ${failed.join(', ')}`);
    } else {
      console.log('All checks passed.');
    }
  }

  process.exit(hasFailures ? 1 : 0);
}
