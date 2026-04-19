import { writeFileSync } from "node:fs";

export interface WriteEnvOptions {
  variables: Record<string, string>;
  comments?: Record<string, string>;
  filePath: string;
}

export function writeEnvFile(options: WriteEnvOptions): void {
  const content = formatEnvContent(options.variables, options.comments);
  writeFileSync(options.filePath, content, "utf-8");
}

export function formatEnvContent(
  variables: Record<string, string>,
  comments?: Record<string, string>,
): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(variables)) {
    if (comments?.[key]) {
      lines.push(`# ${comments[key]}`);
    }
    const needsQuotes =
      value.includes(" ") ||
      value.includes("#") ||
      value.includes("=") ||
      value.includes('"') ||
      value.includes("\n");
    const escaped = needsQuotes
      ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
      : value;
    lines.push(`${key}=${escaped}`);
  }
  return lines.join("\n") + "\n";
}
