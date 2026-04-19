import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import { executeScan } from './scan.js';
import { toCycloneDx, toSpdx } from '../reporters/sbom.js';
import { VowError } from '../errors.js';

type SbomFormat = 'cyclonedx' | 'spdx';

interface SbomOptions {
  path: string;
  format: SbomFormat;
  production: boolean;
  output?: string;
  registry?: boolean;
}

export function registerSbomCommand(program: Command): void {
  program
    .command('sbom')
    .description('Generate a Software Bill of Materials (CycloneDX 1.5 or SPDX 2.3 JSON)')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('-f, --format <fmt>', 'SBOM format: cyclonedx or spdx', 'cyclonedx')
    .option('--production', 'Skip devDependencies', false)
    .option('--no-registry', 'Disable registry API fallback')
    .option('-o, --output <file>', 'Write SBOM to file (stdout if omitted)')
    .action(async (opts: SbomOptions) => {
      if (opts.format !== 'cyclonedx' && opts.format !== 'spdx') {
        throw new VowError(
          'VOW-E2201',
          `--format must be 'cyclonedx' or 'spdx' (got '${opts.format}')`,
        );
      }

      const scan = await executeScan({
        path: opts.path,
        production: opts.production,
        format: 'terminal',
        registry: opts.registry,
      });

      const sbom =
        opts.format === 'cyclonedx' ? toCycloneDx(scan) : toSpdx(scan);
      const serialized = JSON.stringify(sbom, null, 2) + '\n';

      if (opts.output) {
        await writeFile(opts.output, serialized, 'utf-8');
        console.log(chalk.green(`SBOM written to ${opts.output}`));
      } else {
        process.stdout.write(serialized);
      }
    });
}
