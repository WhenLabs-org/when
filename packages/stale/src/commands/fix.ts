import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import type { DriftIssue, DriftReport, DriftCategory } from '../types.js';
import { scanCommand } from './scan.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FixSuggestion {
  issue: DriftIssue;
  file: string;
  line: number;
  /** Original text on the line (or surrounding context) */
  original: string;
  /** The replacement text */
  replacement: string;
  /** Human-readable explanation */
  description: string;
  /** Confidence: high = auto-fixable, medium = likely correct, low = needs review */
  confidence: 'high' | 'medium' | 'low';
}

export interface FixCliFlags {
  format?: 'terminal' | 'diff';
  apply?: boolean;
  dryRun?: boolean;
  path?: string;
  config?: string;
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Fix generators — one per category
// ---------------------------------------------------------------------------

function generateFilePathFix(issue: DriftIssue): FixSuggestion | null {
  const { evidence, source } = issue;
  if (!evidence) return null;

  // Case 1: exact alternative found (renamed file)
  if (evidence.actual && evidence.expected) {
    return {
      issue,
      file: source.file,
      line: source.line,
      original: evidence.expected,
      replacement: evidence.actual,
      description: `Update file path from \`${evidence.expected}\` to \`${evidence.actual}\``,
      confidence: 'high',
    };
  }

  // Case 2: fuzzy matches — suggest the best one but lower confidence
  if (evidence.similarMatches && evidence.similarMatches.length > 0) {
    const best = evidence.similarMatches[0];
    return {
      issue,
      file: source.file,
      line: source.line,
      original: evidence.expected ?? source.text,
      replacement: best,
      description: evidence.similarMatches.length === 1
        ? `Update file path to \`${best}\``
        : `Update file path to \`${best}\` (other candidates: ${evidence.similarMatches.slice(1).map(s => `\`${s}\``).join(', ')})`,
      confidence: evidence.similarMatches.length === 1 ? 'medium' : 'low',
    };
  }

  return null;
}

function generateCommandFix(issue: DriftIssue): FixSuggestion | null {
  const { evidence, source } = issue;
  if (!evidence) return null;

  if (evidence.similarMatches && evidence.similarMatches.length > 0 && evidence.expected) {
    const best = evidence.similarMatches[0];
    // Reconstruct the command with the correct script name
    const original = source.text;
    const replacement = original.replace(evidence.expected, best);

    return {
      issue,
      file: source.file,
      line: source.line,
      original,
      replacement,
      description: `Update command: replace \`${evidence.expected}\` with \`${best}\``,
      confidence: evidence.similarMatches.length === 1 ? 'high' : 'medium',
    };
  }

  return null;
}

function generateEnvVarFix(issue: DriftIssue): FixSuggestion | null {
  const { evidence, source, message } = issue;
  if (!evidence) return null;

  // Case 1: documented var not found in codebase, but similar exists — update doc
  if (evidence.expected && evidence.similarMatches && evidence.similarMatches.length > 0) {
    const best = evidence.similarMatches[0];
    return {
      issue,
      file: source.file,
      line: source.line,
      original: evidence.expected,
      replacement: best,
      description: `Update env var reference from \`${evidence.expected}\` to \`${best}\``,
      confidence: evidence.similarMatches.length === 1 ? 'medium' : 'low',
    };
  }

  // Case 2: documented var not found at all — suggest removing from doc
  if (evidence.expected && !evidence.similarMatches?.length) {
    return {
      issue,
      file: source.file,
      line: source.line,
      original: evidence.expected,
      replacement: '',
      description: `\`${evidence.expected}\` is documented but not used in codebase — consider removing from docs`,
      confidence: 'low',
    };
  }

  // Case 3: used in code but not documented — no file fix, just advisory
  if (evidence.actual && message.includes('not documented')) {
    return {
      issue,
      file: source.file,
      line: source.line,
      original: '',
      replacement: '',
      description: `Add \`${evidence.actual}\` to documentation — it is used in code${evidence.codeLocations?.length ? ` (${evidence.codeLocations[0].file}:${evidence.codeLocations[0].line})` : ''}`,
      confidence: 'medium',
    };
  }

  return null;
}

function generateUrlFix(issue: DriftIssue): FixSuggestion | null {
  const { evidence, source, message } = issue;

  // Port mismatch: update the port in the doc line
  if (evidence?.expected && evidence.actual && message.includes('port')) {
    return {
      issue,
      file: source.file,
      line: source.line,
      original: evidence.expected,
      replacement: evidence.actual,
      description: `Update port from ${evidence.expected} to ${evidence.actual}`,
      confidence: 'high',
    };
  }

  // Dead relative link — no auto-fix unless we can find a replacement
  if (message.includes('Relative link') && evidence?.expected) {
    return {
      issue,
      file: source.file,
      line: source.line,
      original: source.text,
      replacement: '',
      description: `Remove dead relative link \`${source.text}\` or update it to the correct target`,
      confidence: 'low',
    };
  }

  // CI migration
  if (evidence?.expected && evidence.actual && message.includes('CI')) {
    return {
      issue,
      file: source.file,
      line: source.line,
      original: '',
      replacement: '',
      description: `${message} — update CI badge/link to point to GitHub Actions`,
      confidence: 'medium',
    };
  }

  return null;
}

function generateVersionFix(issue: DriftIssue): FixSuggestion | null {
  const { evidence, source } = issue;
  if (!evidence?.expected || !evidence.actual) return null;

  return {
    issue,
    file: source.file,
    line: source.line,
    original: evidence.expected,
    replacement: evidence.actual,
    description: `Update version from \`${evidence.expected}\` to \`${evidence.actual}\``,
    confidence: 'high',
  };
}

function generateDependencyFix(issue: DriftIssue): FixSuggestion | null {
  const { evidence, source } = issue;
  if (!evidence) return null;

  if (evidence.expected && evidence.similarMatches?.length) {
    const best = evidence.similarMatches[0];
    return {
      issue,
      file: source.file,
      line: source.line,
      original: evidence.expected,
      replacement: best,
      description: `Update dependency reference from \`${evidence.expected}\` to \`${best}\``,
      confidence: 'medium',
    };
  }

  return null;
}

function generateApiRouteFix(issue: DriftIssue): FixSuggestion | null {
  const { evidence, source } = issue;
  if (!evidence?.expected || !evidence.actual) return null;

  return {
    issue,
    file: source.file,
    line: source.line,
    original: evidence.expected,
    replacement: evidence.actual,
    description: `Update API route from \`${evidence.expected}\` to \`${evidence.actual}\``,
    confidence: 'medium',
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const FIX_GENERATORS: Partial<Record<DriftCategory, (issue: DriftIssue) => FixSuggestion | null>> = {
  'file-path': generateFilePathFix,
  'command': generateCommandFix,
  'env-var': generateEnvVarFix,
  'url': generateUrlFix,
  'version': generateVersionFix,
  'dependency': generateDependencyFix,
  'api-route': generateApiRouteFix,
};

function generateFixes(issues: DriftIssue[]): { fixes: FixSuggestion[]; unfixable: DriftIssue[] } {
  const fixes: FixSuggestion[] = [];
  const unfixable: DriftIssue[] = [];

  for (const issue of issues) {
    const generator = FIX_GENERATORS[issue.category];
    if (!generator) {
      unfixable.push(issue);
      continue;
    }

    const fix = generator(issue);
    if (fix) {
      fixes.push(fix);
    } else {
      unfixable.push(issue);
    }
  }

  return { fixes, unfixable };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const CONFIDENCE_BADGE: Record<string, string> = {
  high: chalk.green('HIGH'),
  medium: chalk.yellow('MED'),
  low: chalk.red('LOW'),
};

function renderTerminal(fixes: FixSuggestion[], unfixable: DriftIssue[]): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold('Fix Suggestions'));
  lines.push(chalk.dim('─'.repeat(60)));
  lines.push('');

  if (fixes.length === 0) {
    lines.push(chalk.dim('  No auto-fixable issues found.'));
    lines.push('');
  }

  // Group by file
  const byFile = new Map<string, FixSuggestion[]>();
  for (const fix of fixes) {
    const list = byFile.get(fix.file) ?? [];
    list.push(fix);
    byFile.set(fix.file, list);
  }

  for (const [file, fileFixes] of byFile) {
    lines.push(chalk.bold.underline(file));
    lines.push('');

    for (const fix of fileFixes) {
      const badge = CONFIDENCE_BADGE[fix.confidence];
      lines.push(`  ${badge} ${chalk.dim(`line ${fix.line}`)} — ${fix.description}`);

      if (fix.original && fix.replacement) {
        lines.push(`    ${chalk.red(`- ${fix.original}`)}`);
        lines.push(`    ${chalk.green(`+ ${fix.replacement}`)}`);
      }

      lines.push('');
    }
  }

  if (unfixable.length > 0) {
    lines.push(chalk.dim('─'.repeat(60)));
    lines.push(chalk.bold(`${unfixable.length} issue(s) require manual review:`));
    lines.push('');

    for (const issue of unfixable) {
      const icon = issue.severity === 'error' ? chalk.red('✗')
        : issue.severity === 'warning' ? chalk.yellow('⚠')
        : chalk.blue('ℹ');
      lines.push(`  ${icon} ${chalk.dim(`${issue.source.file}:${issue.source.line}`)} — ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`    ${chalk.dim(issue.suggestion)}`);
      }
    }
    lines.push('');
  }

  // Summary line
  const highCount = fixes.filter(f => f.confidence === 'high').length;
  const medCount = fixes.filter(f => f.confidence === 'medium').length;
  const lowCount = fixes.filter(f => f.confidence === 'low').length;

  lines.push(chalk.dim('─'.repeat(60)));
  lines.push(
    `${chalk.bold(String(fixes.length))} fix suggestion(s): ` +
    `${chalk.green(String(highCount))} high, ` +
    `${chalk.yellow(String(medCount))} medium, ` +
    `${chalk.red(String(lowCount))} low confidence` +
    (unfixable.length > 0 ? ` | ${chalk.dim(String(unfixable.length) + ' manual')}` : '')
  );
  lines.push('');

  if (highCount > 0 || medCount > 0) {
    lines.push(chalk.dim('Run with --apply to apply high-confidence fixes.'));
    lines.push(chalk.dim('Run with --format diff to get a patch file.'));
    lines.push('');
  }

  return lines.join('\n');
}

async function renderDiff(fixes: FixSuggestion[], projectPath: string): Promise<string> {
  const lines: string[] = [];

  // Group fixable suggestions by file (only those with actual replacements)
  const applicable = fixes.filter(f => f.original && f.replacement);

  const byFile = new Map<string, FixSuggestion[]>();
  for (const fix of applicable) {
    const list = byFile.get(fix.file) ?? [];
    list.push(fix);
    byFile.set(fix.file, list);
  }

  for (const [file, fileFixes] of byFile) {
    const absPath = resolve(projectPath, file);
    let content: string;
    try {
      content = await readFile(absPath, 'utf-8');
    } catch {
      continue;
    }

    const originalLines = content.split('\n');
    const modifiedLines = [...originalLines];

    // Sort fixes by line number descending so replacements don't shift lines
    const sorted = [...fileFixes].sort((a, b) => b.line - a.line);

    for (const fix of sorted) {
      const lineIdx = fix.line - 1;
      if (lineIdx < 0 || lineIdx >= modifiedLines.length) continue;

      const lineContent = modifiedLines[lineIdx];
      if (lineContent.includes(fix.original)) {
        modifiedLines[lineIdx] = lineContent.replace(fix.original, fix.replacement);
      }
    }

    // Generate unified diff
    lines.push(`--- a/${file}`);
    lines.push(`+++ b/${file}`);

    // Simple line-by-line diff with context
    for (const fix of [...fileFixes].sort((a, b) => a.line - b.line)) {
      const lineIdx = fix.line - 1;
      if (lineIdx < 0 || lineIdx >= originalLines.length) continue;

      if (!originalLines[lineIdx].includes(fix.original)) continue;

      const contextStart = Math.max(0, lineIdx - 3);
      const contextEnd = Math.min(originalLines.length - 1, lineIdx + 3);

      lines.push(`@@ -${contextStart + 1},${contextEnd - contextStart + 1} +${contextStart + 1},${contextEnd - contextStart + 1} @@`);

      for (let i = contextStart; i <= contextEnd; i++) {
        if (i === lineIdx) {
          lines.push(`-${originalLines[i]}`);
          lines.push(`+${modifiedLines[i]}`);
        } else {
          lines.push(` ${originalLines[i]}`);
        }
      }
    }
  }

  if (lines.length === 0) {
    return '# No applicable diffs — all suggestions require manual review.\n';
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Apply fixes
// ---------------------------------------------------------------------------

async function promptConfirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function applyFixes(fixes: FixSuggestion[], projectPath: string, dryRun: boolean): Promise<string> {
  // Only apply high-confidence fixes
  const applicable = fixes.filter(f => f.confidence === 'high' && f.original && f.replacement);

  if (applicable.length === 0) {
    return chalk.yellow('No high-confidence fixes to apply. Use terminal or diff output to review suggestions.\n');
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold(`${applicable.length} high-confidence fix(es) to apply:`));
  lines.push('');

  for (const fix of applicable) {
    lines.push(`  ${chalk.dim(`${fix.file}:${fix.line}`)} — ${fix.description}`);
    lines.push(`    ${chalk.red(`- ${fix.original}`)}`);
    lines.push(`    ${chalk.green(`+ ${fix.replacement}`)}`);
  }
  lines.push('');

  if (dryRun) {
    lines.push(chalk.yellow('Dry run — no files were modified.'));
    lines.push(chalk.dim('Run with --apply --no-dry-run to apply changes.'));
    lines.push('');
    return lines.join('\n');
  }

  // Prompt for confirmation
  console.log(lines.join('\n'));
  const confirmed = await promptConfirm(chalk.bold('Apply these changes? (y/N) '));

  if (!confirmed) {
    return chalk.yellow('\nAborted — no files were modified.\n');
  }

  // Group by file and apply
  const byFile = new Map<string, FixSuggestion[]>();
  for (const fix of applicable) {
    const list = byFile.get(fix.file) ?? [];
    list.push(fix);
    byFile.set(fix.file, list);
  }

  let appliedCount = 0;

  for (const [file, fileFixes] of byFile) {
    const absPath = resolve(projectPath, file);
    let content: string;
    try {
      content = await readFile(absPath, 'utf-8');
    } catch {
      console.error(chalk.red(`  Could not read ${file}, skipping.`));
      continue;
    }

    const fileLines = content.split('\n');
    const sorted = [...fileFixes].sort((a, b) => b.line - a.line);

    for (const fix of sorted) {
      const lineIdx = fix.line - 1;
      if (lineIdx < 0 || lineIdx >= fileLines.length) continue;

      if (fileLines[lineIdx].includes(fix.original)) {
        fileLines[lineIdx] = fileLines[lineIdx].replace(fix.original, fix.replacement);
        appliedCount++;
      }
    }

    await writeFile(absPath, fileLines.join('\n'), 'utf-8');
  }

  const result: string[] = [];
  result.push('');
  result.push(chalk.green(`Applied ${appliedCount} fix(es) across ${byFile.size} file(s).`));
  result.push('');
  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function fixCommand(options: FixCliFlags): Promise<void> {
  const projectPath = resolve(options.path ?? process.cwd());

  // Run scan internally in JSON mode to get structured issues
  const scanOptions = {
    format: 'json' as const,
    path: projectPath,
    config: options.config,
    verbose: options.verbose,
  };

  // Suppress scan output — capture the report directly
  const originalLog = console.log;
  let report: DriftReport;
  try {
    console.log = () => {};
    report = await scanCommand(scanOptions);
  } finally {
    console.log = originalLog;
  }

  if (report.issues.length === 0) {
    console.log(chalk.green('\nNo drift issues found — nothing to fix.\n'));
    return;
  }

  const { fixes, unfixable } = generateFixes(report.issues);

  const format = options.format ?? 'terminal';

  if (options.apply) {
    const dryRun = options.dryRun !== false; // default true when --apply
    const output = await applyFixes(fixes, projectPath, dryRun);
    console.log(output);
    return;
  }

  if (format === 'diff') {
    const output = await renderDiff(fixes, projectPath);
    console.log(output);
    return;
  }

  // Default: terminal
  const output = renderTerminal(fixes, unfixable);
  console.log(output);
}
