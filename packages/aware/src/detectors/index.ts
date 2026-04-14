import type { DetectedStack, StackConfig, StackItem } from "../types.js";
import { detectFramework } from "./framework.js";
import { detectLanguage } from "./language.js";
import { detectStyling } from "./styling.js";
import { detectOrm } from "./orm.js";
import { detectDatabase } from "./database.js";
import { detectTesting } from "./testing.js";
import { detectLinting } from "./linting.js";
import { detectPackageManager } from "./package-manager.js";
import { detectMonorepo } from "./monorepo.js";
import { detectDeployment } from "./deployment.js";
import { detectAuth } from "./auth.js";
import { detectApiStyle } from "./api-style.js";

export async function detectStack(projectRoot: string): Promise<DetectedStack> {
  const [
    framework,
    language,
    styling,
    orm,
    database,
    testing,
    linting,
    packageManager,
    monorepo,
    deployment,
    auth,
    apiStyle,
  ] = await Promise.all([
    detectFramework(projectRoot).catch(() => null),
    detectLanguage(projectRoot).catch(() => null),
    detectStyling(projectRoot).catch(() => null),
    detectOrm(projectRoot).catch(() => null),
    detectDatabase(projectRoot).catch(() => null),
    detectTesting(projectRoot).catch(() => []),
    detectLinting(projectRoot).catch(() => []),
    detectPackageManager(projectRoot).catch(() => null),
    detectMonorepo(projectRoot).catch(() => null),
    detectDeployment(projectRoot).catch(() => null),
    detectAuth(projectRoot).catch(() => null),
    detectApiStyle(projectRoot).catch(() => null),
  ]);

  return {
    framework,
    language,
    styling,
    orm,
    database,
    testing,
    linting,
    packageManager,
    monorepo,
    deployment,
    auth,
    apiStyle,
  };
}

function formatItem(item: StackItem): string {
  let result = item.name;
  if (item.version) result += `@${item.version}`;
  if (item.variant) result += `:${item.variant}`;
  return result;
}

export function stackToConfig(stack: DetectedStack): StackConfig {
  return {
    framework: stack.framework ? formatItem(stack.framework) : null,
    language: stack.language ? formatItem(stack.language) : null,
    styling: stack.styling ? formatItem(stack.styling) : null,
    orm: stack.orm ? formatItem(stack.orm) : null,
    database: stack.database ? formatItem(stack.database) : null,
    testing: stack.testing.map(formatItem),
    linting: stack.linting.map(formatItem),
    packageManager: stack.packageManager ? formatItem(stack.packageManager) : null,
    monorepo: stack.monorepo ? formatItem(stack.monorepo) : null,
    deployment: stack.deployment ? formatItem(stack.deployment) : null,
    auth: stack.auth ? formatItem(stack.auth) : null,
    apiStyle: stack.apiStyle ? formatItem(stack.apiStyle) : null,
  };
}

export function formatStackSummary(stack: DetectedStack): string {
  const lines: string[] = [];
  const width = 18;

  lines.push("Detected Stack");
  lines.push("=".repeat(50));

  const entries: Array<[string, StackItem | StackItem[] | null]> = [
    ["Framework", stack.framework],
    ["Language", stack.language],
    ["Styling", stack.styling],
    ["ORM", stack.orm],
    ["Database", stack.database],
    ["Testing", stack.testing],
    ["Linting", stack.linting],
    ["Package Manager", stack.packageManager],
    ["Monorepo", stack.monorepo],
    ["Deployment", stack.deployment],
    ["Auth", stack.auth],
    ["API Style", stack.apiStyle],
  ];

  for (const [label, value] of entries) {
    const padded = label.padEnd(width);

    if (value === null) {
      lines.push(`  ${padded} --`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`  ${padded} --`);
      } else {
        const items = value.map((v) => `${formatItem(v)} (${(v.confidence * 100).toFixed(0)}%)`).join(", ");
        lines.push(`  ${padded} ${items}`);
      }
    } else {
      lines.push(`  ${padded} ${formatItem(value)} (${(value.confidence * 100).toFixed(0)}%)`);
    }
  }

  lines.push("=".repeat(50));
  return lines.join("\n");
}

export {
  detectFramework,
  detectLanguage,
  detectStyling,
  detectOrm,
  detectDatabase,
  detectTesting,
  detectLinting,
  detectPackageManager,
  detectMonorepo,
  detectDeployment,
  detectAuth,
  detectApiStyle,
};
