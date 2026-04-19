import type { StackConfig } from "../types.js";
import type { StackDrift } from "./types.js";

const KEY_LABELS: Record<string, string> = {
  framework: "Framework",
  language: "Language",
  styling: "Styling",
  orm: "ORM",
  database: "Database",
  testing: "Testing",
  linting: "Linting",
  packageManager: "Package Manager",
  monorepo: "Monorepo",
  deployment: "Deployment",
  auth: "Auth",
  apiStyle: "API Style",
  stateManagement: "State Mgmt",
  cicd: "CI/CD",
  bundler: "Bundler",
};

/**
 * Diff the previously-saved stack against a freshly-detected stack.
 * Pure function — no I/O, no side effects.
 */
export function computeStackDrift(
  previous: StackConfig,
  current: StackConfig,
): StackDrift[] {
  const drifts: StackDrift[] = [];
  const keys = new Set<keyof StackConfig>([
    ...(Object.keys(previous) as (keyof StackConfig)[]),
    ...(Object.keys(current) as (keyof StackConfig)[]),
  ]);

  for (const key of keys) {
    const prev = formatValue(previous[key]);
    const curr = formatValue(current[key]);
    if (prev === curr) continue;

    const kind: StackDrift["kind"] =
      prev === null ? "added" : curr === null ? "removed" : "changed";

    drifts.push({
      key,
      label: KEY_LABELS[key] ?? String(key),
      previous: prev,
      current: curr,
      kind,
    });
  }

  return drifts;
}

function formatValue(val: string | string[] | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) {
    return val.length === 0 ? null : val.join(", ");
  }
  return val;
}
