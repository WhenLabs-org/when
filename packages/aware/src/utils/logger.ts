import chalk from "chalk";

export const log = {
  info: (msg: string) => console.log(chalk.blue("ℹ"), msg),
  success: (msg: string) => console.log(chalk.green("✓"), msg),
  warn: (msg: string) => console.log(chalk.yellow("⚠"), msg),
  error: (msg: string) => console.error(chalk.red("✗"), msg),
  plain: (msg: string) => console.log(msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
  header: (msg: string) => console.log(chalk.bold(msg)),
  table: (label: string, value: string) =>
    console.log(`  ${chalk.dim(label.padEnd(16))}${value}`),
};
