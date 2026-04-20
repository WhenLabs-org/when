import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

const TEMPLATES: Record<string, string> = {
  commercial: `# vow policy — commercial defaults
allow:
  - MIT
  - Apache-2.0
  - ISC
  - BSD-2-Clause
  - BSD-3-Clause
  - Unlicense
  - CC0-1.0
  - LGPL-2.1-only
  - LGPL-3.0-only
deny:
  - GPL-2.0-only
  - GPL-3.0-only
  - AGPL-3.0-only
min_confidence: 0.6
min_confidence_action: warn
`,
  opensource: `# vow policy — open source friendly
allow:
  - MIT
  - Apache-2.0
  - ISC
  - BSD-2-Clause
  - BSD-3-Clause
  - Unlicense
  - CC0-1.0
  - LGPL-2.1-only
  - LGPL-3.0-only
  - MPL-2.0
warn:
  - GPL-2.0-only
  - GPL-3.0-only
deny:
  - AGPL-3.0-only
`,
  strict: `# vow policy — strict permissive-only
allow:
  - MIT
  - Apache-2.0
  - ISC
  - BSD-2-Clause
  - BSD-3-Clause
`,
};

interface InitOptions {
  path: string;
  template: string;
  force: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Generate a starter .vow.yml policy file')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('-t, --template <name>', 'Policy template: commercial, opensource, strict', 'commercial')
    .option('--force', 'Overwrite existing file', false)
    .action(async (opts: InitOptions) => {
      const projectPath = path.resolve(opts.path);
      const outputPath = path.join(projectPath, '.vow.yml');

      if (!opts.force) {
        try {
          await access(outputPath);
          console.error(chalk.yellow(`${outputPath} already exists. Use --force to overwrite.`));
          process.exit(1);
        } catch {
          // File doesn't exist, proceed
        }
      }

      const template = TEMPLATES[opts.template];
      if (!template) {
        console.error(chalk.red(`Unknown template: ${opts.template}`));
        console.error(`Available templates: ${Object.keys(TEMPLATES).join(', ')}`);
        process.exit(2);
      }

      await writeFile(outputPath, template, 'utf-8');
      console.log(chalk.green(`Created ${outputPath} with "${opts.template}" template`));
      console.log(chalk.gray('Edit allow/deny/warn lists as needed, then run: vow check'));
    });
}
