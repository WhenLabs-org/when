import { resolve } from 'node:path';
import type { CliFlags, DriftReport, DriftSummary, DriftIssue, DriftCategory } from '../types.js';
import { resolveConfig } from '../config.js';
import { parseAllDocs } from '../parsers/markdown.js';
import { parseCodebase } from '../parsers/codebase.js';
import { getStaticAnalyzers, getAiAnalyzers, runAnalyzers } from '../analyzers/registry.js';
import { getReporter } from '../reporters/index.js';

const ALL_CATEGORIES: DriftCategory[] = [
  'command', 'file-path', 'env-var', 'url', 'version', 'dependency', 'api-route',
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

export async function scanCommand(options: CliFlags): Promise<DriftReport> {
  const startTime = Date.now();
  const projectPath = resolve(options.path ?? process.cwd());

  const config = await resolveConfig(projectPath, options);

  // Parse in parallel
  const [docs, codebase] = await Promise.all([
    parseAllDocs(config.docs, projectPath),
    parseCodebase(projectPath, config),
  ]);

  if (docs.length === 0) {
    console.log('No documentation files found. Nothing to check.');
    process.exit(0);
  }

  const ctx = { docs, codebase, config, projectPath };

  // Run static analyzers
  const staticAnalyzers = getStaticAnalyzers(config);
  const issues = await runAnalyzers(staticAnalyzers, ctx);

  // Run AI analyzers if enabled
  if (config.ai.enabled) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Error: --deep requires ANTHROPIC_API_KEY environment variable');
      process.exit(1);
    }
    const aiAnalyzers = getAiAnalyzers(config);
    const aiIssues = await runAnalyzers(aiAnalyzers, ctx);
    issues.push(...aiIssues);
  }

  const duration = Date.now() - startTime;

  // Estimate total checks (each analyzer runs multiple checks per doc)
  const totalChecks = issues.length + Math.max(docs.length * staticAnalyzers.length, issues.length);

  const report: DriftReport = {
    projectPath,
    scannedAt: new Date(),
    duration,
    docsScanned: docs.map((d) => d.filePath),
    config,
    issues,
    summary: buildSummary(issues, totalChecks),
  };

  // Render output
  const reporter = getReporter(config.output.format);
  const output = reporter.render(report);
  console.log(output);

  // Exit with error if errors found
  if (report.summary.errors > 0) {
    process.exitCode = 1;
  }

  return report;
}
