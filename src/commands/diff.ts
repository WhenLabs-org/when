import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, runCli, writeCache, deriveProject } from '../mcp/run-cli.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function colorize(text: string, ...codes: string[]): string {
  return codes.join('') + text + c.reset;
}

interface CacheEntry {
  timestamp: number;
  output: string;
  code: number;
}

function readCache(tool: string, project: string): CacheEntry | null {
  const file = join(CACHE_DIR, `${tool}_${project}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as CacheEntry;
  } catch {
    return null;
  }
}

function diffLines(oldOutput: string, newOutput: string): { added: string[]; removed: string[]; unchanged: string[] } {
  const oldLines = new Set(oldOutput.split('\n').map((l) => l.trim()).filter(Boolean));
  const newLines = new Set(newOutput.split('\n').map((l) => l.trim()).filter(Boolean));

  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  for (const line of newLines) {
    if (oldLines.has(line)) {
      unchanged.push(line);
    } else {
      added.push(line);
    }
  }

  for (const line of oldLines) {
    if (!newLines.has(line)) {
      removed.push(line);
    }
  }

  return { added, removed, unchanged };
}

const TOOLS: Array<{ bin: string; args: string[]; label: string }> = [
  { bin: 'stale', args: ['scan'], label: 'stale' },
  { bin: 'envalid', args: ['validate'], label: 'envalid' },
  { bin: 'berth', args: ['status'], label: 'berth' },
  { bin: 'vow', args: ['scan'], label: 'vow' },
  { bin: 'aware', args: ['doctor'], label: 'aware' },
];

export function createDiffCommand(): Command {
  const cmd = new Command('diff');
  cmd.description('Compare cached tool results to fresh runs and show what changed');

  cmd.action(async () => {
    const cwd = process.cwd();
    const project = deriveProject(cwd);

    console.log('');
    console.log(colorize('  when diff', c.bold, c.cyan));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));
    console.log(`  ${colorize('project', c.dim)}  ${colorize(project, c.bold)}`);
    console.log('');

    let anyChanges = false;

    for (const tool of TOOLS) {
      const cached = readCache(tool.label, project);
      const fresh = await runCli(tool.bin, tool.args, cwd);

      const freshOutput = fresh.stdout.trim() || fresh.stderr.trim() || '';

      if (!cached) {
        // No prior cache — show fresh output as baseline
        console.log(`  ${colorize(tool.label, c.bold, c.cyan)}`);
        if (freshOutput) {
          for (const line of freshOutput.split('\n').slice(0, 5)) {
            if (line.trim()) console.log(`    ${colorize(line, c.dim)}`);
          }
          const total = freshOutput.split('\n').filter(Boolean).length;
          if (total > 5) console.log(`    ${colorize(`… ${total - 5} more lines`, c.dim)}`);
        } else {
          console.log(`    ${colorize('no output', c.dim)}`);
        }
        console.log(`    ${colorize('(no prior cache — this is now the baseline)', c.dim)}`);
      } else {
        const oldOutput = cached.output.trim();
        const { added, removed, unchanged } = diffLines(oldOutput, freshOutput);

        const hasChanges = added.length > 0 || removed.length > 0;
        if (hasChanges) anyChanges = true;

        console.log(`  ${colorize(tool.label, c.bold, c.cyan)}`);

        if (!hasChanges) {
          console.log(`    ${colorize('✓', c.dim)}  ${colorize('no changes', c.dim)} ${colorize(`(${unchanged.length} line(s))`, c.dim)}`);
        } else {
          for (const line of added) {
            console.log(`    ${colorize('+', c.green)}  ${colorize(line, c.green)}`);
          }
          for (const line of removed) {
            console.log(`    ${colorize('-', c.red)}  ${colorize(line, c.red)}`);
          }
          if (unchanged.length > 0) {
            console.log(`    ${colorize('·', c.dim)}  ${colorize(`${unchanged.length} line(s) unchanged`, c.dim)}`);
          }
        }
      }

      // Write fresh results to cache
      writeCache(tool.label, project, freshOutput, fresh.code);
      console.log('');
    }

    if (!anyChanges) {
      console.log(`  ${colorize('✓', c.green)}  All tools unchanged since last run`);
    } else {
      console.log(`  ${colorize('•', c.dim)}  Cache updated with latest results`);
    }

    console.log('');
  });

  return cmd;
}
