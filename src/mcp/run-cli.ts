import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { findBin } from '../utils/find-bin.js';

export { findBin };

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

export const CACHE_DIR = join(homedir(), '.whenlabs', 'cache');

export function writeCache(tool: string, project: string, output: string, code: number): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const file = join(CACHE_DIR, `${tool}_${project}.json`);
    writeFileSync(file, JSON.stringify({ timestamp: Date.now(), output, code }));
  } catch {
    // best-effort
  }
}

export function deriveProject(path?: string): string {
  const dir = path || process.cwd();
  return dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'unknown';
}

export function readAwareProjectName(path?: string): string | null {
  try {
    const awareFile = join(path || process.cwd(), '.aware.json');
    if (!existsSync(awareFile)) return null;
    const data = JSON.parse(readFileSync(awareFile, 'utf8'));
    return data.name || data.project || null;
  } catch {
    return null;
  }
}

export function formatOutput(result: { stdout: string; stderr: string; code: number }): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trim());
  if (result.stderr.trim()) parts.push(result.stderr.trim());
  return parts.join('\n') || 'No output';
}

export async function checkTriggers(toolName: string, result: { stdout: string; stderr: string; code: number }, path?: string): Promise<string[]> {
  const output = result.stdout || result.stderr || '';
  const extras: string[] = [];

  if (toolName === 'aware_init') {
    // Only trigger if aware_init made actual changes (look for "wrote" / "created" / "updated" in output)
    const madeChanges = /wrote|created|updated|generated/i.test(output);
    if (madeChanges) {
      const staleResult = await runCli('stale', ['scan'], path);
      const staleOutput = staleResult.stdout || staleResult.stderr || '';
      writeCache('stale', deriveProject(path), staleOutput, staleResult.code);
      if (staleOutput.trim()) {
        extras.push(`\n--- Auto-triggered stale_scan (stack change detected) ---\n${staleOutput}`);
      }
    }
  }

  if (toolName === 'vow_scan') {
    // Trigger note if unknown licenses found
    const hasUnknown = /unknown|UNKNOWN|unlicensed/i.test(output);
    if (hasUnknown) {
      extras.push('\nNote: Unknown licenses detected — check README for license accuracy claims.');
    }
  }

  if (toolName === 'berth_check') {
    // If conflicts found, try to include project name from .aware.json
    const hasConflicts = /conflict|in use|occupied|taken/i.test(output);
    if (hasConflicts) {
      const projectName = readAwareProjectName(path);
      if (projectName) {
        extras.push(`\nNote: Conflicts found in project "${projectName}".`);
      }
    }
  }

  return extras;
}
