import chalk from 'chalk';
import type { GlobalOptions, Conflict } from '../types.js';
import { detectAllActive, detectAllConfigured } from '../detectors/index.js';
import { detectConflicts } from '../resolver/conflicts.js';
import { loadRegistry } from '../registry/store.js';
import { formatJson } from '../reporters/json.js';
import { renderConflict } from '../reporters/terminal.js';

interface WatchOptions extends GlobalOptions {
  interval?: number;
  notify?: boolean;
}

export async function watchCommand(options: WatchOptions): Promise<void> {
  const intervalMs = (options.interval ?? 5) * 1000;
  let previousConflictKeys = new Set<string>();

  if (!options.json) {
    console.log(chalk.bold('Watching for port conflicts...'));
    console.log(chalk.dim(`Polling every ${intervalMs / 1000}s. Press Ctrl+C to stop.\n`));
  }

  const poll = async () => {
    try {
      const [{ ports: active, docker }, registry] = await Promise.all([
        detectAllActive(),
        loadRegistry(),
      ]);

      const allConfigured = [];
      for (const project of Object.values(registry.projects)) {
        try {
          const { ports } = await detectAllConfigured(project.directory);
          allConfigured.push(...ports);
        } catch {
          // skip unreachable project dirs
        }
      }

      const conflicts = detectConflicts(active, docker, allConfigured);
      const currentKeys = new Set(conflicts.map(conflictKey));

      // Find new conflicts
      const newConflicts = conflicts.filter((c) => !previousConflictKeys.has(conflictKey(c)));
      // Find resolved conflicts
      const resolvedKeys = [...previousConflictKeys].filter((k) => !currentKeys.has(k));

      if (options.json) {
        if (newConflicts.length > 0 || resolvedKeys.length > 0) {
          console.log(formatJson({
            timestamp: new Date().toISOString(),
            totalConflicts: conflicts.length,
            new: newConflicts,
            resolved: resolvedKeys,
          }));
        }
      } else {
        if (newConflicts.length > 0) {
          const timestamp = new Date().toLocaleTimeString();
          console.log(chalk.red(`\n[${timestamp}] ${newConflicts.length} new conflict${newConflicts.length !== 1 ? 's' : ''} detected:`));
          for (const c of newConflicts) {
            console.log(renderConflict(c));
          }

          if (options.notify) {
            sendNotification(newConflicts);
          }
        }

        if (resolvedKeys.length > 0) {
          const timestamp = new Date().toLocaleTimeString();
          console.log(chalk.green(`\n[${timestamp}] ${resolvedKeys.length} conflict${resolvedKeys.length !== 1 ? 's' : ''} resolved.`));
        }
      }

      previousConflictKeys = currentKeys;
    } catch (err) {
      if (options.verbose) {
        console.error(`Poll error: ${err}`);
      }
    }
  };

  // Initial poll
  await poll();

  // Polling loop
  const timer = setInterval(poll, intervalMs);

  // Clean shutdown
  const cleanup = () => {
    clearInterval(timer);
    if (!options.json) {
      console.log(chalk.dim('\nStopped watching.'));
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function conflictKey(conflict: Conflict): string {
  return `${conflict.port}:${conflict.severity}`;
}

function sendNotification(conflicts: Conflict[]): void {
  try {
    const notifier = require('node-notifier');
    const ports = conflicts.map((c) => c.port).join(', ');
    notifier.notify({
      title: 'Berth — Port Conflict',
      message: `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} detected on port${conflicts.length !== 1 ? 's' : ''} ${ports}`,
      sound: true,
    });
  } catch {
    // node-notifier not available, skip silently
  }
}
