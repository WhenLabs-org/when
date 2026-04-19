import { resolve } from 'node:path';
import type { CliFlags, DriftReport, DriftSummary, DriftIssue, DriftCategory } from '../types.js';
import { resolveConfig } from '../config.js';
import { parseAllDocs } from '../parsers/markdown.js';
import { parseCodebase } from '../parsers/codebase.js';
import { getStaticAnalyzers, getAiAnalyzers, runAnalyzers } from '../analyzers/registry.js';
import { getReporter } from '../reporters/index.js';

const ALL_CATEGORIES: DriftCategory[] = [
  'command', 'file-path', 'env-var', 'url', 'version', 'dependency', 'api-route',
  'git-staleness', 'comment-staleness',
  'semantic', 'completeness', 'example', 'architecture', 'response-shape',
];

function buildSummary(issues: DriftIssue[], totalChecks: number): DriftSummary {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const infos = issues.filter((i) => i.severity === 'info').length;

  const byCategory = {} as DriftSummary['byCategory'];
  for (const cat of ALL_CATEGORIES) {
    const catIssues = issues.filter((i) => i.category === cat);
    byCategory[cat] = {
      errors: catIssues.filter((i) => i.severity === 'error').length,
      warnings: catIssues.filter((i) => i.severity === 'warning').length,
      passed: 0,
    };
  }

  return {
    totalChecks,
    errors,
    warnings,
    infos,
    passed: totalChecks - errors - warnings - infos,
    byCategory,
  };
}

export type ScanOutcome =
  | { kind: 'report'; report: DriftReport }
  | { kind: 'no-docs' }
  | { kind: 'missing-ai-key' };

export async function scan(options: CliFlags): Promise<ScanOutcome> {
  const startTime = Date.now();
  const projectPath = resolve(options.path ?? process.cwd());

  const config = await resolveConfig(projectPath, options);

  const [docs, codebase] = await Promise.all([
    parseAllDocs(config.docs, projectPath),
    parseCodebase(projectPath, config),
  ]);

  if (docs.length === 0) {
    return { kind: 'no-docs' };
  }

  const ctx = { docs, codebase, config, projectPath };

  const staticAnalyzers = getStaticAnalyzers(config);
  const issues = await runAnalyzers(staticAnalyzers, ctx);
  let analyzerCount = staticAnalyzers.length;

  if (config.ai.enabled) {
    if (!process.env.STALE_AI_KEY) {
      return { kind: 'missing-ai-key' };
    }
    const aiAnalyzers = getAiAnalyzers(config);
    const aiIssues = await runAnalyzers(aiAnalyzers, ctx);
    issues.push(...aiIssues);
    analyzerCount += aiAnalyzers.length;
  }

  const duration = Date.now() - startTime;
  const totalChecks = docs.length * analyzerCount;

  const report: DriftReport = {
    projectPath,
    scannedAt: new Date(),
    duration,
    docsScanned: docs.map((d) => d.filePath),
    config,
    issues,
    summary: buildSummary(issues, totalChecks),
  };

  return { kind: 'report', report };
}

export async function scanCommand(options: CliFlags): Promise<DriftReport> {
  const outcome = await scan(options);

  if (outcome.kind === 'no-docs') {
    console.log('No documentation files found. Nothing to check.');
    process.exit(0);
  }

  if (outcome.kind === 'missing-ai-key') {
    console.error('Error: --deep requires STALE_AI_KEY environment variable');
    process.exit(1);
  }

  const { report } = outcome;
  const reporter = getReporter(report.config.output.format);
  console.log(reporter.render(report));

  if (report.summary.errors > 0) {
    process.exitCode = 1;
  }

  return report;
}
