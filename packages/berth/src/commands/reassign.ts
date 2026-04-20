import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { parsePortString } from '../utils/ports.js';
import { reassignPort } from '../resolver/actions.js';
import { formatJson } from '../reporters/json.js';

interface ReassignOptions extends GlobalOptions {
  dryRun?: boolean;
}

export async function reassignCommand(
  oldPortStr: string,
  newPortStr: string,
  options: ReassignOptions,
): Promise<void> {
  const dryRun = options.dryRun === true;
  const oldPort = parsePortString(oldPortStr);
  const newPort = parsePortString(newPortStr);

  if (oldPort === null || newPort === null) {
    console.error(chalk.red('Invalid port number(s).'));
    process.exitCode = 2;
    return;
  }

  if (oldPort === newPort) {
    console.error(chalk.red('Old and new ports are the same.'));
    process.exitCode = 2;
    return;
  }

  const result = await reassignPort(process.cwd(), oldPort, newPort, { dryRun });

  if (options.json) {
    console.log(formatJson({ oldPort, newPort, filesModified: result.filesModified, dryRun }));
  } else {
    if (result.filesModified.length > 0) {
      const verb = dryRun ? 'Would reassign' : 'Reassigned';
      console.log(chalk.green(`${verb} port ${oldPort} → ${newPort}`));
      console.log(dryRun ? 'Files that would be modified:' : 'Modified files:');
      for (const f of result.filesModified) {
        console.log(`  ${f}`);
      }
      if (dryRun) {
        console.log(chalk.dim('\nDry run — no files written. Re-run without --dry-run to apply.'));
      }
    } else {
      console.log(chalk.yellow(`No files found containing port ${oldPort}.`));
    }
  }
}
