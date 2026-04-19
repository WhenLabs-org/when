import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { executeScan } from './scan.js';
import type { PackageInfo } from '../types.js';

interface AttributionOptions {
  path: string;
  output: string;
  production: boolean;
}

export function registerAttributionCommand(program: Command): void {
  program
    .command('attribution')
    .description('Generate a THIRD_PARTY_LICENSES.md file listing all dependencies and their licenses')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('-o, --output <file>', 'Output file', 'THIRD_PARTY_LICENSES.md')
    .option('--production', 'Skip devDependencies', false)
    .action(async (opts: AttributionOptions) => {
      const projectPath = path.resolve(opts.path);

      // Scan
      const scanResult = await executeScan({
        path: opts.path,
        production: opts.production,
        format: 'terminal',
      });

      if (scanResult.packages.length === 0) {
        console.log(chalk.yellow('No packages found.'));
        return;
      }

      // Generate attribution content
      const content = await generateAttribution(scanResult.packages, projectPath, scanResult.project);

      const outputPath = path.resolve(projectPath, opts.output);
      await writeFile(outputPath, content, 'utf-8');
      console.log(chalk.green(`Attribution file written to ${outputPath}`));
      console.log(chalk.gray(`Included ${scanResult.packages.length} packages.`));
    });
}

async function generateAttribution(
  packages: PackageInfo[],
  projectPath: string,
  project: { name: string; version: string },
): Promise<string> {
  const lines: string[] = [];

  lines.push('# Third-Party Licenses');
  lines.push('');
  lines.push(`This file lists the licenses for all third-party dependencies of **${project.name}@${project.version}**.`);
  lines.push('');
  lines.push(`Generated on ${new Date().toISOString().split('T')[0]!} by [Vow](https://github.com/vow-cli/vow).`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Sort packages alphabetically
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name));

  for (const pkg of sorted) {
    const license = pkg.license.spdxExpression ?? 'UNKNOWN';
    lines.push(`## ${pkg.name}@${pkg.version}`);
    lines.push('');
    lines.push(`- **License:** ${license}`);
    lines.push(`- **Type:** ${pkg.dependencyType}`);

    if (pkg.license.source === 'license-file') {
      lines.push(`- **Source:** LICENSE file`);
    }

    lines.push('');

    // Try to include the actual license text
    const licenseText = await getLicenseText(pkg, projectPath);
    if (licenseText) {
      lines.push('<details>');
      lines.push('<summary>License Text</summary>');
      lines.push('');
      lines.push('```');
      lines.push(licenseText);
      lines.push('```');
      lines.push('');
      lines.push('</details>');
    } else {
      lines.push('_License text not available._');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

async function getLicenseText(pkg: PackageInfo, _projectPath: string): Promise<string | null> {
  // If we already have license text from the scan
  if (pkg.license.licenseText) {
    return pkg.license.licenseText;
  }

  // If we have a license file path
  if (pkg.license.licenseFilePath) {
    try {
      const content = await readFile(pkg.license.licenseFilePath, 'utf-8');
      return content.slice(0, 10_000); // Cap at 10KB per license
    } catch {
      // Fall through
    }
  }

  // Try to find LICENSE file in the package directory
  if (pkg.path) {
    const licenseFiles = [
      'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.MIT', 'LICENSE.BSD',
      'LICENCE', 'LICENCE.md', 'LICENCE.txt',
      'COPYING', 'COPYING.md', 'COPYING.txt',
      'license', 'license.md', 'license.txt',
    ];

    for (const name of licenseFiles) {
      try {
        const content = await readFile(path.join(pkg.path, name), 'utf-8');
        return content.slice(0, 10_000);
      } catch {
        continue;
      }
    }
  }

  return null;
}
