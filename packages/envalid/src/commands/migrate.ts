import { parseMigrationFile } from "../migrate/parser.js";
import {
  readLedger,
  writeLedger,
  hasApplied,
  recordApplied,
} from "../migrate/ledger.js";
import {
  applyMigration,
  formatDiff,
  type FileChange,
} from "../migrate/apply.js";
import { resolve } from "node:path";

export interface RunMigrateOptions {
  migrationPath: string;
  cwd?: string;
  schemaPath?: string;
  envPaths?: string[];
  codePaths?: string[];
  ledgerPath?: string;
  dryRun?: boolean;
  backup?: boolean;
  /** Force re-apply even if already applied with the same hash. */
  force?: boolean;
}

export interface RunMigrateResult {
  applied: boolean;
  changes: FileChange[];
  diffs: string[];
  reason?: string;
}

export function runMigrate(options: RunMigrateOptions): RunMigrateResult {
  const cwd = options.cwd ?? process.cwd();
  const { migration, hash, id } = parseMigrationFile(
    resolve(cwd, options.migrationPath),
  );
  const ledgerPath = resolve(
    cwd,
    options.ledgerPath ?? ".envalid/migrations.json",
  );
  const ledger = readLedger(ledgerPath);
  if (!options.force && hasApplied(ledger, id, hash)) {
    return {
      applied: false,
      changes: [],
      diffs: [],
      reason: `Migration ${id} already applied`,
    };
  }

  const { changes } = applyMigration({
    migration,
    migrationId: id,
    cwd,
    schemaPath: options.schemaPath ?? ".env.schema",
    envPaths: options.envPaths,
    codePaths: options.codePaths,
    dryRun: options.dryRun,
    backup: options.backup ?? true,
  });

  if (!options.dryRun && changes.length > 0) {
    const next = recordApplied(ledger, {
      id,
      hash,
      appliedAt: new Date().toISOString(),
    });
    writeLedger(ledgerPath, next);
  }

  return {
    applied: !options.dryRun,
    changes,
    diffs: changes.map(formatDiff),
  };
}
