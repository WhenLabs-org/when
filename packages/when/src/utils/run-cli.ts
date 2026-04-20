import { spawn } from 'node:child_process';
import { findBin } from './find-bin.js';

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(name: string, args: string[], cwd?: string): Promise<RunCliResult> {
  return new Promise((res) => {
    const child = spawn(findBin(name), args, {
      cwd: cwd ?? process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', () => res({ stdout, stderr, exitCode: 127 }));
    child.on('close', (code) => res({ stdout, stderr, exitCode: code ?? 0 }));
  });
}

export function formatOutput(result: RunCliResult): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trim());
  if (result.stderr.trim()) parts.push(result.stderr.trim());
  return parts.join('\n') || 'No output';
}
