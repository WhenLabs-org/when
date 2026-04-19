import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { executeScan } from './scan.js';
import { toJSON } from '../reporters/json.js';
import { toCSV } from '../reporters/csv.js';
import { toMarkdown } from '../reporters/markdown.js';

interface ExportOptions {
  path: string;
  format: string;
  output?: string;
  production: boolean;
}

const FORMAT_EXTENSIONS: Record<string, string> = {
  json: 'json',
  csv: 'csv',
  markdown: 'md',
};

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export full license report')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('-f, --format <fmt>', 'Output format: json, csv, markdown', 'json')
    .option('-o, --output <file>', 'Output file path')
    .option('--production', 'Skip devDependencies', false)
    .action(async (opts: ExportOptions) => {
      const result = await executeScan({
        path: opts.path,
        production: opts.production,
        format: 'json',
      });

      let output: string;
      switch (opts.format) {
        case 'csv':
          output = toCSV(result);
          break;
        case 'markdown':
          output = toMarkdown(result);
          break;
        default:
          output = toJSON(result, true);
      }

      const ext = FORMAT_EXTENSIONS[opts.format] ?? 'json';
      const outputPath = opts.output ?? `vow-report.${ext}`;

      await writeFile(outputPath, output, 'utf-8');
      console.log(`Report exported to ${outputPath}`);
    });
}
