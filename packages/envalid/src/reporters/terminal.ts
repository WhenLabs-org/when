import chalk from "chalk";
import type {
  Reporter,
  ValidationResult,
  DiffResult,
} from "../schema/types.js";

export class TerminalReporter implements Reporter {
  reportValidation(result: ValidationResult): string {
    const lines: string[] = [""];

    // Report valid variables (those not mentioned in issues)
    const issueVars = new Set(result.issues.map((i) => i.variable));

    for (const issue of result.issues) {
      const icon =
        issue.severity === "error"
          ? chalk.red("✗")
          : issue.severity === "warning"
            ? chalk.yellow("⚠")
            : chalk.blue("ℹ");

      const kindLabel =
        issue.kind === "live-check-failed"
          ? chalk.magenta(" [live]")
          : issue.kind === "live-check-skipped"
            ? chalk.dim(" [live:skipped]")
            : issue.kind === "secret-resolution-failed"
              ? chalk.magenta(" [secret]")
              : issue.kind === "secret-resolution-skipped"
                ? chalk.dim(" [secret:skipped]")
                : "";
      lines.push(
        `  ${icon} ${chalk.bold(issue.variable)}${kindLabel}: ${issue.message}`,
      );
      if (issue.actual) {
        lines.push(`    actual: ${issue.actual}`);
      }
      if (issue.suggestion) {
        lines.push(`    suggestion: ${issue.suggestion}`);
      }
    }

    lines.push("");
    if (result.valid) {
      lines.push(
        chalk.green(`  ✓ All ${result.stats.total} variables valid`),
      );
    } else {
      const parts: string[] = [];
      if (result.stats.errors > 0)
        parts.push(chalk.red(`${result.stats.errors} error(s)`));
      if (result.stats.warnings > 0)
        parts.push(chalk.yellow(`${result.stats.warnings} warning(s)`));
      lines.push(`  ${parts.join(", ")}`);
    }

    return lines.join("\n");
  }

  reportDiff(result: DiffResult): string {
    const lines: string[] = [
      "",
      `  Comparing ${chalk.bold(result.source)} ↔ ${chalk.bold(result.target)}`,
      "",
    ];

    if (result.entries.length === 0) {
      lines.push(chalk.green("  ✓ Environments are identical"));
      return lines.join("\n");
    }

    for (const entry of result.entries) {
      switch (entry.status) {
        case "added":
          lines.push(
            `  ${chalk.green("+")} ${chalk.bold(entry.variable)} (in target, not in source)`,
          );
          break;
        case "removed":
          lines.push(
            `  ${chalk.red("-")} ${chalk.bold(entry.variable)} (in source, not in target)${entry.required ? chalk.red(" — required!") : ""}`,
          );
          break;
        case "changed":
          lines.push(
            `  ${chalk.yellow("~")} ${chalk.bold(entry.variable)} (different values)`,
          );
          if (entry.sourceValue && entry.targetValue) {
            lines.push(
              `    source: ${entry.sourceValue}  →  target: ${entry.targetValue}`,
            );
          }
          break;
      }
    }

    return lines.join("\n");
  }

  reportSync(results: Map<string, ValidationResult>): string {
    const lines: string[] = [""];

    for (const [envPath, result] of results) {
      const status = result.valid
        ? chalk.green("✓")
        : chalk.red("✗");
      lines.push(`  ${status} ${chalk.bold(envPath)}`);

      if (!result.valid) {
        for (const issue of result.issues) {
          if (issue.severity === "error") {
            lines.push(`    ${chalk.red("✗")} ${issue.variable}: ${issue.message}`);
          }
        }
      }
    }

    lines.push("");
    const allValid = [...results.values()].every((r) => r.valid);
    if (allValid) {
      lines.push(chalk.green("  ✓ All environments valid"));
    } else {
      const failCount = [...results.values()].filter((r) => !r.valid).length;
      lines.push(
        chalk.red(`  ✗ ${failCount} environment(s) have issues`),
      );
    }

    return lines.join("\n");
  }
}
