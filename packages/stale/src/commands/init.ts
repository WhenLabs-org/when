import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';

const DEFAULT_CONFIG_YAML = `# Stale configuration
# Documentation drift detection settings

# Which doc files to scan (glob patterns)
docs:
  - "README.md"
  - "CONTRIBUTING.md"
  - "docs/**/*.md"

# Files/patterns to ignore
ignore:
  - "node_modules/**"
  - "dist/**"
  - ".git/**"

# Which checks to enable
checks:
  commands: true
  filePaths: true
  envVars: true
  urls: true
  versions: true
  dependencies: true
  apiRoutes: true

# AI-powered analysis (requires STALE_AI_KEY)
ai:
  enabled: false
  model: sonnet  # sonnet or opus
  checks:
    semantic: true
    completeness: true
    examples: true

# Output format: terminal, json, markdown, sarif
output:
  format: terminal
`;

export async function initCommand(): Promise<void> {
  const projectPath = process.cwd();
  const configPath = join(projectPath, '.stale.yml');

  if (existsSync(configPath)) {
    console.log(chalk.yellow('⚠ .stale.yml already exists'));
    return;
  }

  await writeFile(configPath, DEFAULT_CONFIG_YAML, 'utf-8');
  console.log(chalk.green('✓ Created .stale.yml'));
  console.log(chalk.dim('  Edit this file to customize your drift checks.'));
  console.log(chalk.dim('  Run `stale scan` to check for documentation drift.'));
}
