import { Command } from 'commander';
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

const TEMPLATES: Record<string, string> = {
  commercial: `policy: |
  Allow MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, Unlicense, and CC0-1.0.
  Allow LGPL for all dependency types.
  Block GPL and AGPL licenses.
  Block packages with no license or unknown license.
  Warn on any license not explicitly mentioned above.
`,
  opensource: `policy: |
  Allow all permissive licenses (MIT, Apache-2.0, ISC, BSD, Unlicense, CC0).
  Allow LGPL and MPL licenses.
  Warn on GPL licenses.
  Block AGPL licenses.
  Warn on packages with no license or unknown license.
`,
  strict: `policy: |
  Allow only MIT, Apache-2.0, ISC, BSD-2-Clause, and BSD-3-Clause.
  Block all copyleft licenses including GPL, AGPL, LGPL, and MPL.
  Block packages with no license or unknown license.
  Block any license not explicitly allowed above.
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
    .description('Generate a starter policy file (.vow.yml for plain-English, or use .vow.json for structured policies)')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('-t, --template <name>', 'Policy template: commercial, opensource, strict', 'commercial')
    .option('--force', 'Overwrite existing file', false)
    .action(async (opts: InitOptions) => {
      const projectPath = path.resolve(opts.path);
      const outputPath = path.join(projectPath, '.vow.yml');

      // Check if file exists
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
      console.log(chalk.gray('Edit the policy field with your own rules in plain English.'));
      console.log(chalk.gray('Then run: vow check'));
    });
}
