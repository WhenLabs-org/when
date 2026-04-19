import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { findBin } from '../utils/find-bin.js';
import {
  detectProjectDirName,
  readAwareProjectName,
} from '../utils/detect-project.js';
import { getToolConfig, WhenlabsConfig } from '../config/whenlabs-config.js';
import { entriesDir, writeEntry } from '../utils/cache.js';
import type { SuggestionRule, TriggerContext } from '@whenlabs/core';

export { findBin };

// Re-export to preserve the pre-refactor public surface of this module
// (the tool shims import these from './run-cli.js').
export { readAwareProjectName };
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

export function loadToolConfig<K extends keyof WhenlabsConfig>(
  toolName: K,
  path?: string
): WhenlabsConfig[K] | null {
  return getToolConfig(toolName, path);
}

const SUGGESTION_RULES: SuggestionRule[] = [
  {
    id: 'aware-init-stack-change',
    tool: 'aware_init',
    match: ({ output }) => /wrote|created|updated|generated/i.test(output),
    async emit({ path }) {
      const staleResult = await runCli('stale', ['scan'], path);
      const staleOutput = staleResult.stdout || staleResult.stderr || '';
      writeCache('stale', detectProjectDirName(path), staleOutput, staleResult.code);
      if (!staleOutput.trim()) return [];
      return [`\n--- Auto-triggered stale_scan (stack change detected) ---\n${staleOutput}`];
    },
  },
  {
    id: 'vow-scan-unknown',
    tool: 'vow_scan',
    match: ({ output }) => /unknown|UNKNOWN|unlicensed/i.test(output),
    emit: () => ['\nNote: Unknown licenses detected — check README for license accuracy claims.'],
  },
  {
    id: 'berth-check-conflicts',
    tool: 'berth_check',
    match: ({ output }) => /conflict|in use|occupied|taken/i.test(output),
    emit({ path }) {
      const hints: string[] = [];
      const projectName = readAwareProjectName(path);
      if (projectName) {
        hints.push(`\nNote: Conflicts found in project "${projectName}".`);
      }
      try {
        const cacheFiles = readdirSync(CACHE_DIR).filter((f) => f.startsWith('stale_'));
        for (const cacheFile of cacheFiles) {
          const cached = JSON.parse(readFileSync(join(CACHE_DIR, cacheFile), 'utf8')) as { output?: string };
          if (/\b\d{4,5}\b/.test(cached.output ?? '')) {
            hints.push('\nTip: Port references found in documentation — stale_scan may need re-run after resolving conflicts.');
            break;
          }
        }
      } catch {
        // best-effort
      }
      return hints;
    },
  },
  {
    id: 'envalid-detect-service-urls',
    tool: 'envalid_detect',
    match: ({ output }) => /\b[A-Z_]*(?:HOST|PORT|URL|URI)[A-Z_]*\b/.test(output),
    emit({ output }) {
      const matches = output.match(/\b[A-Z_]*(?:HOST|PORT|URL|URI)[A-Z_]*\b/g) ?? [];
      const examples = [...new Set(matches)].slice(0, 3).join(', ');
      return [`\nTip: Service URLs detected (${examples}, etc.) — run berth_register to track their ports for conflict detection.`];
    },
  },
  {
    id: 'velocity-large-change',
    tool: 'velocity_end_task',
    match: ({ output }) =>
      /actual_files["\s:]+([1-9]\d)/i.test(output) || /\b([6-9]|\d{2,})\s+files?\b/i.test(output),
    emit: () => ['\nTip: Large change detected — consider running stale_scan to check for documentation drift.'],
  },
  {
    id: 'vow-scan-first-or-new',
    tool: 'vow_scan',
    match: ({ output, path }) => {
      const cacheFile = join(CACHE_DIR, `vow_scan_${detectProjectDirName(path)}.json`);
      const isFirstScan = !existsSync(cacheFile);
      const hasNewPackages = /new package|added|installed/i.test(output);
      return isFirstScan || hasNewPackages;
    },
    emit: () => ['\nTip: Dependency changes detected — run aware_sync to update AI context files with new library info.'],
  },
];

export async function checkTriggers(toolName: string, result: { stdout: string; stderr: string; code: number }, path?: string): Promise<string[]> {
  const ctx: TriggerContext = {
    toolName,
    output: result.stdout || result.stderr || '',
    path,
  };
  const extras: string[] = [];
  for (const rule of SUGGESTION_RULES) {
    if (rule.tool !== toolName) continue;
    if (!(await rule.match(ctx))) continue;
    const hints = await rule.emit(ctx);
    extras.push(...hints);
  }
  return extras;
}

// Exported for tests
export const _internal = { SUGGESTION_RULES };
