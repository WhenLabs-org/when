import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { StaleConfig, CliFlags, Severity } from './types.js';
import { ConfigError } from './errors.js';

export const DEFAULT_CONFIG: StaleConfig = {
  docs: ['README.md', 'CONTRIBUTING.md', 'docs/**/*.md'],
  ignore: ['node_modules/**', 'dist/**', '.git/**'],
  checks: {
    commands: true,
    filePaths: true,
    envVars: true,
    urls: true,
    versions: true,
    dependencies: true,
    apiRoutes: true,
  },
  ai: {
    enabled: false,
    model: 'sonnet',
    checks: {
      semantic: true,
      completeness: true,
      examples: true,
    },
  },
  severity: {
    missingFile: 'error',
    deadCommand: 'error',
    undocumentedEnvVar: 'warning',
    staleEnvVar: 'error',
    brokenUrl: 'error',
    versionMismatch: 'error',
    missingDependency: 'warning',
    routeMismatch: 'error',
  },
  output: {
    format: 'terminal',
  },
};

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal) &&
      targetVal !== null
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result;
}

export async function loadConfig(projectPath: string): Promise<StaleConfig> {
  const configNames = ['.stale.yml', '.stale.yaml'];

  for (const name of configNames) {
    try {
      const content = await readFile(join(projectPath, name), 'utf-8');
      const parsed = parseYaml(content);
      if (parsed && typeof parsed === 'object') {
        return deepMerge(DEFAULT_CONFIG as Record<string, any>, parsed as Record<string, any>) as StaleConfig;
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new ConfigError(`Failed to parse ${name}: ${(err as Error).message}`);
    }
  }

  return { ...DEFAULT_CONFIG };
}

export function mergeWithCliFlags(config: StaleConfig, flags: CliFlags): StaleConfig {
  const result = { ...config };

  if (flags.deep) {
    result.ai = { ...result.ai, enabled: true };
  }
  if (flags.format) {
    result.output = { ...result.output, format: flags.format };
  }

  return result;
}

export async function resolveConfig(projectPath: string, flags: CliFlags): Promise<StaleConfig> {
  const configPath = flags.config ? flags.config : projectPath;
  const config = await loadConfig(flags.config ? join(projectPath, flags.config, '..') : projectPath);
  return mergeWithCliFlags(config, flags);
}
