import chalk from "chalk";

// Silent mode: commands that emit machine-readable output to stdout
// (e.g. `aware diff --json`) call `setSilent(true)` so transitive log
// calls from shared code don't corrupt the output stream. Errors still
// flow to stderr so real failures remain visible.
let silent = false;

export function setSilent(value: boolean): void {
  silent = value;
}

export function isSilent(): boolean {
  return silent;
}

function out(line: string): void {
  if (silent) return;
  console.log(line);
}

export const log = {
  info: (msg: string) => out(`${chalk.blue("ℹ")} ${msg}`),
  success: (msg: string) => out(`${chalk.green("✓")} ${msg}`),
  warn: (msg: string) => out(`${chalk.yellow("⚠")} ${msg}`),
  // Errors always go to stderr regardless of silent mode.
  error: (msg: string) => console.error(`${chalk.red("✗")} ${msg}`),
  plain: (msg: string) => out(msg),
  dim: (msg: string) => out(chalk.dim(msg)),
  header: (msg: string) => out(chalk.bold(msg)),
  table: (label: string, value: string) =>
    out(`  ${chalk.dim(label.padEnd(16))}${value}`),
};
