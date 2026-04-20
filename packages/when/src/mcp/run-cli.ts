import { writeEntry } from '../utils/cache.js';

export { runCli, formatOutput } from '../utils/run-cli.js';
export type { RunCliResult } from '../utils/run-cli.js';

export function writeCache(tool: string, project: string, output: string, code: number): void {
  writeEntry(tool, project, output, code);
}
