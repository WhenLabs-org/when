import { spawn } from 'node:child_process';
import { findBin } from '../utils/find-bin.js';
import { detectProjectDirName } from '../utils/detect-project.js';
import { entriesDir, writeEntry } from '../utils/cache.js';

export { findBin };

export const deriveProject = detectProjectDirName;

export function runCli(bin: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((res) => {
    const child = spawn(findBin(bin), args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => res({ stdout, stderr: err.message, code: 1 }));
    child.on('close', (code) => res({ stdout, stderr, code: code ?? 0 }));
  });
}

export const CACHE_DIR = entriesDir();

export function writeCache(tool: string, project: string, output: string, code: number): void {
  writeEntry(tool, project, output, code);
}

export function formatOutput(result: { stdout: string; stderr: string; code: number }): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trim());
  if (result.stderr.trim()) parts.push(result.stderr.trim());
  return parts.join('\n') || 'No output';
}

// Cross-tool suggestion rules were removed in the 6-tool-suite trim.
// Kept as a no-op so register-scan-tool.ts doesn't need to branch.
export async function checkTriggers(
  _toolName: string,
  _result: { stdout: string; stderr: string; code: number },
  _path?: string,
): Promise<string[]> {
  return [];
}
