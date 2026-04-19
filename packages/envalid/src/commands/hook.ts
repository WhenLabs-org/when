import chalk from "chalk";
import { installHook, uninstallHook, isHookInstalled } from "../utils/git.js";

export function runHookInstall(): void {
  const result = installHook();
  if (result.installed) {
    console.log(chalk.green(`✓ ${result.message}`));
    console.log(`  Hook path: ${chalk.bold(result.hookPath!)}`);
    console.log(
      chalk.dim(
        "  Envalid will now validate your .env on every commit.",
      ),
    );
  } else {
    console.log(chalk.yellow(`⚠ ${result.message}`));
  }
}

export function runHookUninstall(): void {
  const result = uninstallHook();
  if (result.removed) {
    console.log(chalk.green(`✓ ${result.message}`));
  } else {
    console.log(chalk.yellow(`⚠ ${result.message}`));
  }
}

export function runHookStatus(): void {
  if (isHookInstalled()) {
    console.log(chalk.green("✓ Envalid pre-commit hook is installed"));
  } else {
    console.log(
      chalk.dim(
        "Envalid pre-commit hook is not installed. Run `envalid hook install` to set it up.",
      ),
    );
  }
}
