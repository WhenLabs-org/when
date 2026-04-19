import { resolve } from "node:path";
import chalk from "chalk";
import { loadSchema } from "../schema/loader.js";
import { readEnvFile } from "../env/reader.js";
import { validate } from "./validate.js";
import { createReporter, type ReporterFormat } from "../reporters/index.js";
import { startWatching } from "../runtime/watcher.js";

export interface WatchOptions {
  schemaPath: string;
  envPath: string;
  environment?: string;
  format?: ReporterFormat;
  /** Override for tests. */
  onReport?: (text: string) => void;
  signal?: AbortSignal;
}

export function runWatch(options: WatchOptions): () => void {
  const print = options.onReport ?? ((t) => console.log(t));
  const reporter = createReporter(options.format ?? "terminal");

  const runOnce = () => {
    try {
      const schema = loadSchema(options.schemaPath);
      const envFile = readEnvFile(options.envPath);
      const result = validate(schema, envFile, {
        environment: options.environment,
      });
      print(chalk.dim(`\n[envalid] ${new Date().toLocaleTimeString()}`));
      print(reporter.reportValidation(result));
    } catch (err) {
      print(chalk.red(`\n[envalid] ${(err as Error).message}`));
    }
  };

  runOnce();

  const stop = startWatching({
    paths: [resolve(options.schemaPath), resolve(options.envPath)],
    onChange: runOnce,
    signal: options.signal,
  });

  return stop;
}
