import { basename, resolve } from 'node:path';
import type {
  Finding,
  Location,
  ProjectContext,
  ScanOptions,
  ScanResult,
  Tool,
} from '@whenlabs/core';
import { schemaVersion } from '@whenlabs/core';
import { scan as runScan } from './commands/scan.js';
import type { CliFlags, DriftIssue, DriftReport } from './types.js';

const TOOL_NAME = 'stale';
const TOOL_DESCRIPTION = 'Detect documentation drift in your codebase';

export interface StaleScanOptions {
  git?: boolean;
  format?: 'terminal' | 'json' | 'markdown';
  config?: string;
  path?: string;
  verbose?: boolean;
}

function toLocation(issue: DriftIssue): Location {
  return {
    file: issue.source.file,
    line: issue.source.line,
    column: issue.source.column,
    snippet: issue.source.text,
  };
}

function issueToFinding(issue: DriftIssue): Finding {
  return {
    tool: TOOL_NAME,
    ruleId: issue.category,
    severity: issue.severity === 'warning' ? 'warning' : issue.severity,
    message: issue.message,
    suggestion: issue.suggestion,
    location: toLocation(issue),
    data: {
      id: issue.id,
      category: issue.category,
      evidence: issue.evidence,
      gitInfo: issue.gitInfo,
    },
  };
}

export async function scan(opts: ScanOptions = {}): Promise<ScanResult> {
  const startedAt = new Date();
  const hr = process.hrtime.bigint();
  const cwd = resolve(opts.cwd ?? process.cwd());
  const toolOpts = (opts.options ?? {}) as StaleScanOptions;

  const project: ProjectContext = {
    name: basename(cwd),
    cwd,
    detectedStack: [],
  };

  const flags: CliFlags = {
    git: toolOpts.git,
    format: toolOpts.format,
    config: toolOpts.config,
    path: toolOpts.path ?? cwd,
    verbose: toolOpts.verbose,
  };

  const outcome = await runScan(flags);
  const findings: Finding[] = [];
  let raw: DriftReport | undefined;

  if (outcome.kind === 'report') {
    raw = outcome.report;
    for (const issue of outcome.report.issues) {
      findings.push(issueToFinding(issue));
    }
  }
  // 'no-docs' is a clean result — no findings, ok: true.

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  const durationMs = Number((process.hrtime.bigint() - hr) / 1_000_000n);

  return {
    schemaVersion,
    tool: TOOL_NAME,
    ok: errors === 0,
    project,
    findings,
    summary: {
      total: findings.length,
      errors,
      warnings,
      infos,
      extra: raw ? { docsScanned: raw.docsScanned.length } : undefined,
    },
    timing: {
      startedAt: startedAt.toISOString(),
      durationMs,
    },
    raw,
  };
}

export function createTool(): Tool {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    scan,
  };
}
