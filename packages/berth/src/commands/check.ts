import path from 'node:path';
import chalk from 'chalk';
import type { GlobalOptions, CheckOutput } from '../types.js';
import { detectAllActive, detectAllConfigured } from '../detectors/index.js';
import { detectConflicts } from '../resolver/conflicts.js';
import { suggestResolutions } from '../resolver/suggestions.js';
import { renderCheck } from '../reporters/terminal.js';
import { formatJson } from '../reporters/json.js';

interface CheckOptions extends GlobalOptions {
  fix?: boolean;
}

export async function checkCommand(dir: string, options: CheckOptions): Promise<void> {
  const absDir = path.resolve(dir);
  const projectName = path.basename(absDir);

  const [{ ports: active, docker }, { ports: configured, warnings }] = await Promise.all([
    detectAllActive(),
    detectAllConfigured(absDir),
  ]);

  const conflicts = detectConflicts(active, docker, configured);

  const allResolutions = [];
  for (const conflict of conflicts) {
    const resolutions = await suggestResolutions(conflict);
    allResolutions.push(...resolutions);
  }

  // Build scanned sources summary
  const sourceMap = new Map<string, { file: string; type: string; count: number }>();
  for (const p of configured) {
    const key = p.sourceFile;
    const existing = sourceMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      sourceMap.set(key, { file: path.relative(absDir, p.sourceFile), type: p.source, count: 1 });
    }
  }

  const output: CheckOutput = {
    project: projectName,
    directory: absDir,
    scannedSources: Array.from(sourceMap.values()).map((s) => ({
      file: s.file,
      type: s.type as any,
      portsFound: s.count,
    })),
    conflicts,
    resolutions: allResolutions,
  };

  if (options.json) {
    console.log(formatJson(output));
  } else {
    console.log(renderCheck(output));
    if (options.verbose) {
      for (const w of warnings) {
        console.error(`Warning: ${w}`);
      }
    }
  }

  if (conflicts.length > 0) {
    if (options.fix) {
      // Delegate to the resolve command
      const { resolveCommand } = await import('./resolve.js');
      console.log(''); // visual separator
      await resolveCommand({
        ...options,
        dir: absDir,
        strategy: 'auto',
        kill: false,
      });
    } else if (!options.json) {
      console.log(chalk.dim(`\nRun ${chalk.white('berth resolve')} to auto-fix conflicts.`));
    }
    process.exitCode = 1;
  }
}
