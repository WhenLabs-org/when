import type {
  Reporter,
  ValidationResult,
  DiffResult,
} from "../schema/types.js";

export class MarkdownReporter implements Reporter {
  reportValidation(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.valid) {
      lines.push("## ✅ Environment Validation Passed");
    } else {
      lines.push("## ❌ Environment Validation Failed");
    }

    lines.push("");
    lines.push(
      `| Status | Variable | Message |`,
      `|--------|----------|---------|`,
    );

    for (const issue of result.issues) {
      const icon =
        issue.severity === "error"
          ? "❌"
          : issue.severity === "warning"
            ? "⚠️"
            : "ℹ️";
      lines.push(`| ${icon} | \`${issue.variable}\` | ${issue.message} |`);
    }

    lines.push("");
    lines.push(
      `**${result.stats.valid}/${result.stats.total}** variables valid | ` +
        `${result.stats.errors} error(s) | ${result.stats.warnings} warning(s)`,
    );

    return lines.join("\n");
  }

  reportDiff(result: DiffResult): string {
    const lines: string[] = [
      `## Environment Diff: \`${result.source}\` ↔ \`${result.target}\``,
      "",
    ];

    if (result.entries.length === 0) {
      lines.push("✅ Environments are identical");
      return lines.join("\n");
    }

    lines.push(
      "| Status | Variable | Details |",
      "|--------|----------|---------|",
    );

    for (const entry of result.entries) {
      const icon =
        entry.status === "added"
          ? "➕"
          : entry.status === "removed"
            ? "➖"
            : "🔄";
      const details =
        entry.status === "changed" && entry.sourceValue && entry.targetValue
          ? `\`${entry.sourceValue}\` → \`${entry.targetValue}\``
          : entry.status === "added"
            ? "In target only"
            : "In source only";
      lines.push(`| ${icon} | \`${entry.variable}\` | ${details} |`);
    }

    return lines.join("\n");
  }

  reportSync(results: Map<string, ValidationResult>): string {
    const lines: string[] = ["## Environment Sync Report", ""];

    for (const [envPath, result] of results) {
      const icon = result.valid ? "✅" : "❌";
      lines.push(`### ${icon} \`${envPath}\``);
      if (!result.valid) {
        for (const issue of result.issues) {
          if (issue.severity === "error") {
            lines.push(`- ❌ \`${issue.variable}\`: ${issue.message}`);
          }
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
