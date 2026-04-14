import type { Analyzer, AiAnalyzer, AnalyzerContext, DriftIssue, StaleConfig } from '../types.js';
import { CommandsAnalyzer } from './static/commands.js';
import { FilePathsAnalyzer } from './static/file-paths.js';
import { EnvVarsAnalyzer } from './static/env-vars.js';
import { UrlsAnalyzer } from './static/urls.js';
import { VersionsAnalyzer } from './static/versions.js';
import { DependenciesAnalyzer } from './static/dependencies.js';
import { ApiRoutesAnalyzer } from './static/api-routes.js';
import { SemanticAnalyzer } from './ai/semantic.js';
import { CompletenessAnalyzer } from './ai/completeness.js';
import { ExamplesAnalyzer } from './ai/examples.js';

export function getStaticAnalyzers(config: StaleConfig): Analyzer[] {
  const analyzers: Analyzer[] = [];

  if (config.checks.commands) analyzers.push(new CommandsAnalyzer());
  if (config.checks.filePaths) analyzers.push(new FilePathsAnalyzer());
  if (config.checks.envVars) analyzers.push(new EnvVarsAnalyzer());
  if (config.checks.urls) analyzers.push(new UrlsAnalyzer());
  if (config.checks.versions) analyzers.push(new VersionsAnalyzer());
  if (config.checks.dependencies) analyzers.push(new DependenciesAnalyzer());
  if (config.checks.apiRoutes) analyzers.push(new ApiRoutesAnalyzer());

  return analyzers;
}

export function getAiAnalyzers(config: StaleConfig): AiAnalyzer[] {
  const analyzers: AiAnalyzer[] = [];

  if (!config.ai.enabled) return analyzers;

  if (config.ai.checks.semantic) analyzers.push(new SemanticAnalyzer());
  if (config.ai.checks.completeness) analyzers.push(new CompletenessAnalyzer());
  if (config.ai.checks.examples) analyzers.push(new ExamplesAnalyzer());

  return analyzers;
}

export async function runAnalyzers(analyzers: Analyzer[], ctx: AnalyzerContext): Promise<DriftIssue[]> {
  const results = await Promise.allSettled(
    analyzers.map((analyzer) => analyzer.analyze(ctx)),
  );

  const issues: DriftIssue[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      issues.push(...result.value);
    } else {
      console.error(`Analyzer "${analyzers[i].name}" failed: ${result.reason}`);
    }
  }

  // Sort by file, then line
  issues.sort((a, b) => {
    const fileCompare = a.source.file.localeCompare(b.source.file);
    if (fileCompare !== 0) return fileCompare;
    return a.source.line - b.source.line;
  });

  return issues;
}
