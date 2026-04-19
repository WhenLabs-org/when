import chalk from "chalk";
import { computeDriftReport, exitCodeFor, type DriftSeverity } from "../diff/index.js";
import type { DriftReport, ContentDrift, StackDrift } from "../diff/index.js";
import {
  discoverWorkspace,
  resolvePackageConfig,
} from "../monorepo/index.js";
import { loadConfig } from "../utils/config.js";
import { log, setSilent } from "../utils/logger.js";
import { confirm } from "../utils/prompts.js";
import { syncCommand } from "./sync.js";
import type { AwareConfig, TargetName } from "../types.js";

interface DiffOptions {
  /**
   * CI / script mode: print human output then exit with a code that reflects
   * the highest severity found (0 no drift, 1 warn, 2 tamper). Non-zero
   * exit is what makes this command usable as a pre-commit / CI guard.
   */
  check?: boolean;
  /** Emit a machine-readable JSON `DriftReport` to stdout instead of text. */
  json?: boolean;
  /** Restrict the content-drift check to a single target. */
  target?: TargetName;
  /** Suppress human output under `--check` (still exits with the right code). */
  quiet?: boolean;
  /**
   * Legacy flag, pre-Phase-1: exit 0 / 1 based on stack changes alone.
   * Superseded by `--check`. Kept so existing scripts don't break.
   */
  exitCode?: boolean;
}

export async function diffCommand(options: DiffOptions = {}): Promise<void> {
  const projectRoot = process.cwd();

  // Silence diagnostic logs so `--json` stdout is guaranteed parseable even
  // if transitive code paths decide to log (migrations, future telemetry).
  // Errors still go to stderr.
  if (options.json) setSilent(true);

  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }

  // Monorepo: root declares `packages`. Iterate each package and
  // aggregate into a single report so `--check` / `--json` stay
  // usable in CI.
  if (config.packages && config.packages.length > 0) {
    const report = await computeMonorepoDriftReport(projectRoot, options.target);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      if (options.check) {
        process.exit(exitCodeFor(report.severity));
        return;
      }
      return;
    }
    renderReport(report, config._meta.lastSyncedAt);
    if (options.check) {
      process.exit(exitCodeFor(report.severity));
      return;
    }
    return;
  }

  const report = await computeDriftReport({
    projectRoot,
    config,
    ...(options.target ? { target: options.target } : {}),
  });

  if (options.json) {
    // Deliberately plain `console.log` — stdout must be valid JSON only.
    console.log(JSON.stringify(report, null, 2));
    if (options.check) {
      process.exit(exitCodeFor(report.severity));
      return;
    }
    return;
  }

  // Human output is suppressed in any non-interactive exit-code mode
  // (either `--check` or legacy `--exit-code`) when `--quiet` is set, and
  // also auto-suppressed for legacy `--exit-code` on its own — scripts
  // piping that command's output never expected human lines.
  const suppressHuman =
    options.quiet === true || (options.exitCode === true && options.check !== true);

  if (!suppressHuman) {
    renderReport(report, config._meta.lastSyncedAt);
  }

  if (options.check) {
    process.exit(exitCodeFor(report.severity));
    return; // defensive: unreachable in prod, but test environments mock exit()
  }
  if (options.exitCode) {
    // Legacy: 1 iff any stack drift exists (old behavior predates content drift).
    process.exit(report.hasStackDrift ? 1 : 0);
    return;
  }

  // Interactive: offer to sync when there's drift and no machine-readable mode.
  if (report.severity !== "none") {
    log.plain("");
    const apply = await confirm("Apply changes and sync?");
    if (apply) {
      await syncCommand({ dryRun: false });
    }
  }
}

function renderReport(report: DriftReport, lastSyncedAt: string | null): void {
  const when = lastSyncedAt ? timeSince(new Date(lastSyncedAt)) : "never";
  log.header(`\naware diff  (last sync: ${when})\n`);

  if (report.severity === "none") {
    log.success("No drift detected — stack, config, and generated files all match.");
    return;
  }

  if (report.hasStackDrift) {
    log.header("Stack drift:");
    const labelWidth = Math.max(
      ...report.stackDrifts.map((d) => d.label.length),
      12,
    );
    for (const drift of report.stackDrifts) {
      renderStackLine(drift, labelWidth);
    }
    log.plain("");
  }

  if (report.hasContentDrift) {
    log.header("Generated file drift:");
    for (const drift of report.contentDrifts) {
      renderContentLine(drift);
    }
    log.plain("");
  }

  renderSummary(report);
}

function renderStackLine(drift: StackDrift, labelWidth: number): void {
  const padded = drift.label.padEnd(labelWidth);
  const prev = drift.previous ?? "--";
  const curr = drift.current ?? "--";

  switch (drift.kind) {
    case "added":
      console.log(`  ${chalk.green("+")} ${padded}  ${chalk.green(curr)}`);
      break;
    case "removed":
      console.log(
        `  ${chalk.red("-")} ${padded}  ${chalk.red.strikethrough(prev)}`,
      );
      break;
    case "changed":
      console.log(
        `  ${chalk.yellow("~")} ${padded}  ${chalk.red(prev)} ${chalk.dim("→")} ${chalk.green(curr)}`,
      );
      break;
  }
}

function renderContentLine(drift: ContentDrift): void {
  const colored =
    drift.kind === "tampered"
      ? chalk.red
      : drift.kind === "outdated"
        ? chalk.yellow
        : drift.kind === "missing"
          ? chalk.magenta
          : chalk.dim;
  const icon = drift.kind === "tampered" ? "!" : "~";
  console.log(`  ${colored(icon)} ${colored(drift.kind.padEnd(9))}  ${drift.message}`);
  if (drift.sections && drift.sections.length > 0) {
    for (const section of drift.sections) {
      const marker =
        section.kind === "added" ? "+" : section.kind === "removed" ? "-" : "~";
      console.log(`      ${chalk.dim(marker)} ${chalk.dim(section.id)}`);
    }
  }
}

function renderSummary(report: DriftReport): void {
  const parts: string[] = [];
  if (report.hasStackDrift) parts.push(`${report.stackDrifts.length} stack change(s)`);
  if (report.hasContentDrift)
    parts.push(`${report.contentDrifts.length} file drift(s)`);
  if (report.hasTamper) parts.push(chalk.red("tampering detected"));

  const summary = parts.join(", ");
  if (report.severity === "tamper") {
    log.error(`Summary: ${summary}`);
  } else {
    log.warn(`Summary: ${summary}`);
  }
  log.dim("Run `aware sync` to reconcile.");
}

/**
 * Build a single `DriftReport` that covers every package in a monorepo.
 * Per-package drifts carry their `packagePath` so the `--json` consumer
 * can still localize; severity is the max across packages so one
 * tampered file in one package is enough to fail CI.
 */
async function computeMonorepoDriftReport(
  projectRoot: string,
  target: TargetName | undefined,
): Promise<DriftReport> {
  const discovery = await discoverWorkspace(projectRoot);
  if (!discovery.isMonorepo) {
    // Root declares packages but discovery found none — surface as an
    // empty, clean report rather than crashing. Doctor will flag the
    // misconfiguration separately.
    return {
      stackDrifts: [],
      contentDrifts: [],
      severity: "none",
      hasStackDrift: false,
      hasContentDrift: false,
      hasTamper: false,
    };
  }

  const aggregate: DriftReport = {
    stackDrifts: [],
    contentDrifts: [],
    severity: "none",
    hasStackDrift: false,
    hasContentDrift: false,
    hasTamper: false,
  };

  for (const pkg of discovery.packages) {
    let resolved: AwareConfig | null;
    try {
      const r = await resolvePackageConfig(pkg.absolutePath);
      resolved = r?.config ?? null;
    } catch (err) {
      // Log AND escalate severity: a package with a broken .aware.json
      // (cycle, corrupt JSON, unresolvable extends) must not let CI
      // pass green. Previously we silently skipped — that hid real
      // problems behind "all good".
      log.error(
        `${pkg.relativePath}: could not resolve config — ${(err as Error).message}`,
      );
      aggregate.severity = maxSeverity(aggregate.severity, "warn");
      aggregate.hasContentDrift = true;
      aggregate.contentDrifts.push({
        target: "claude", // placeholder; the drift is about the config, not a target
        filePath: ".aware.json",
        packagePath: pkg.relativePath,
        kind: "unmanaged",
        message: `${pkg.relativePath}/.aware.json could not be resolved: ${(err as Error).message}`,
      });
      continue;
    }
    if (!resolved) {
      log.warn(
        `${pkg.relativePath}: no .aware.json — run \`aware init\` inside the package.`,
      );
      aggregate.severity = maxSeverity(aggregate.severity, "warn");
      aggregate.hasContentDrift = true;
      aggregate.contentDrifts.push({
        target: "claude",
        filePath: ".aware.json",
        packagePath: pkg.relativePath,
        kind: "missing",
        message: `${pkg.relativePath}/.aware.json is missing`,
      });
      continue;
    }

    const pkgReport = await computeDriftReport({
      projectRoot: pkg.absolutePath,
      config: resolved,
      packagePath: pkg.relativePath,
      ...(target ? { target } : {}),
    });

    aggregate.stackDrifts.push(...pkgReport.stackDrifts);
    aggregate.contentDrifts.push(...pkgReport.contentDrifts);
    aggregate.hasStackDrift =
      aggregate.hasStackDrift || pkgReport.hasStackDrift;
    aggregate.hasContentDrift =
      aggregate.hasContentDrift || pkgReport.hasContentDrift;
    aggregate.hasTamper = aggregate.hasTamper || pkgReport.hasTamper;
    aggregate.severity = maxSeverity(aggregate.severity, pkgReport.severity);
  }

  return aggregate;
}

function maxSeverity(a: DriftSeverity, b: DriftSeverity): DriftSeverity {
  const order: DriftSeverity[] = ["none", "warn", "tamper"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
