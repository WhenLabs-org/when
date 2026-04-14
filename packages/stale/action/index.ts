// GitHub Action entry point
// This file is compiled separately for the action context
// It uses @actions/core and @actions/github which are only available in GitHub Actions

import { resolve } from 'node:path';
import { resolveConfig } from '../src/config.js';
import { parseAllDocs } from '../src/parsers/markdown.js';
import { parseCodebase } from '../src/parsers/codebase.js';
import { getStaticAnalyzers, getAiAnalyzers, runAnalyzers } from '../src/analyzers/registry.js';
import { getReporter } from '../src/reporters/index.js';
import type { DriftReport, DriftSummary, DriftIssue, DriftCategory } from '../src/types.js';

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

  return { totalChecks, errors, warnings, infos, passed: totalChecks - errors - warnings - infos, byCategory };
}

async function run(): Promise<void> {
  // Dynamic imports for GitHub Actions packages (not available locally)
  const core = await import('@actions/core');
  const github = await import('@actions/github');

  try {
    const deep = core.getInput('deep') === 'true';
    const failOn = core.getInput('fail-on') || 'error';
    const comment = core.getInput('comment') === 'true';
    const configPath = core.getInput('config') || undefined;
    const format = core.getInput('format') || 'markdown';

    const projectPath = resolve(process.env.GITHUB_WORKSPACE || process.cwd());

    const config = await resolveConfig(projectPath, {
      deep,
      format: format as any,
      config: configPath,
    });

    const [docs, codebase] = await Promise.all([
      parseAllDocs(config.docs, projectPath),
      parseCodebase(projectPath, config),
    ]);

    if (docs.length === 0) {
      core.info('No documentation files found. Nothing to check.');
      return;
    }

    const ctx = { docs, codebase, config, projectPath };
    const startTime = Date.now();

    const staticAnalyzers = getStaticAnalyzers(config);
    const issues = await runAnalyzers(staticAnalyzers, ctx);

    if (config.ai.enabled) {
      const aiAnalyzers = getAiAnalyzers(config);
      const aiIssues = await runAnalyzers(aiAnalyzers, ctx);
      issues.push(...aiIssues);
    }

    const duration = Date.now() - startTime;
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

    // Output report
    const reporter = getReporter(config.output.format);
    const output = reporter.render(report);
    core.info(output);

    // Post PR comment
    if (comment && github.context.payload.pull_request) {
      const token = process.env.GITHUB_TOKEN || core.getInput('github-token');
      if (token) {
        const octokit = github.getOctokit(token);
        const mdReporter = getReporter('markdown');
        const body = mdReporter.render(report);

        const { owner, repo } = github.context.repo;
        const issue_number = github.context.payload.pull_request.number;

        // Look for existing comment to update
        const { data: comments } = await octokit.rest.issues.listComments({
          owner, repo, issue_number,
        });
        const existing = comments.find((c: any) =>
          c.body?.includes('Stale: Documentation Drift Report'),
        );

        if (existing) {
          await octokit.rest.issues.updateComment({
            owner, repo, comment_id: existing.id, body,
          });
        } else {
          await octokit.rest.issues.createComment({
            owner, repo, issue_number, body,
          });
        }
      }
    }

    // Set outputs
    core.setOutput('errors', report.summary.errors);
    core.setOutput('warnings', report.summary.warnings);
    core.setOutput('passed', report.summary.passed);

    // Fail check if needed
    if (failOn === 'error' && report.summary.errors > 0) {
      core.setFailed(`Documentation drift detected: ${report.summary.errors} errors found`);
    } else if (failOn === 'warning' && (report.summary.errors > 0 || report.summary.warnings > 0)) {
      core.setFailed(`Documentation drift detected: ${report.summary.errors} errors, ${report.summary.warnings} warnings`);
    }
  } catch (error: unknown) {
    core.setFailed(`Stale action failed: ${(error as Error).message}`);
  }
}

run();
