import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import type { MigrationFile, MigrationOp } from "./types.js";

export interface FileChange {
  path: string;
  before: string;
  after: string;
}

export interface ApplyMigrationOptions {
  migration: MigrationFile;
  migrationId: string;
  cwd?: string;
  /** Schema file to mutate. */
  schemaPath: string;
  /** Env files to mutate (absolute or cwd-relative). */
  envPaths?: string[];
  /** Source files to mutate (absolute or cwd-relative). */
  codePaths?: string[];
  /** When true, don't write anything; just return changes. */
  dryRun?: boolean;
  /** When true, produce .envalid/backups/<id>/... copies of original files. */
  backup?: boolean;
}

export interface ApplyMigrationResult {
  changes: FileChange[];
}

export function applyMigration(
  options: ApplyMigrationOptions,
): ApplyMigrationResult {
  const cwd = options.cwd ?? process.cwd();
  const changes: FileChange[] = [];

  const schemaAbs = resolve(cwd, options.schemaPath);
  collectChange(
    changes,
    schemaAbs,
    (content) => applyToSchema(content, options.migration),
  );

  for (const p of options.envPaths ?? []) {
    const abs = resolve(cwd, p);
    collectChange(changes, abs, (content) =>
      applyToEnv(content, options.migration),
    );
  }
  for (const p of options.codePaths ?? []) {
    const abs = resolve(cwd, p);
    collectChange(changes, abs, (content) =>
      applyToCode(content, options.migration),
    );
  }

  if (!options.dryRun) {
    for (const change of changes) {
      if (options.backup) backupFile(cwd, options.migrationId, change);
      writeFileSync(change.path, change.after, "utf-8");
    }
  }

  return { changes };
}

function collectChange(
  acc: FileChange[],
  path: string,
  transform: (content: string) => string,
): void {
  if (!existsSync(path)) return;
  const before = readFileSync(path, "utf-8");
  const after = transform(before);
  if (before !== after) acc.push({ path, before, after });
}

function backupFile(cwd: string, id: string, change: FileChange): void {
  const root = join(cwd, ".envalid", "backups", id);
  const rel = change.path.startsWith(cwd)
    ? change.path.slice(cwd.length).replace(/^\/+/, "")
    : change.path.replace(/^\/+/, "");
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, change.before, "utf-8");
}

export function applyToSchema(content: string, migration: MigrationFile): string {
  // We parse/stringify via YAML so we preserve structure reasonably well.
  const doc = YAML.parseDocument(content);
  const variables = doc.get("variables") as unknown as
    | { items?: Array<{ key: { value: string } }> }
    | undefined;
  if (!variables) return content;

  for (const op of migration.migrations) {
    if ("rename" in op) {
      const { from, to } = op.rename;
      const pair = variables.items?.find((item) => item.key.value === from);
      if (pair) pair.key.value = to;
      // Also rewrite groups
      renameInGroups(doc, from, to);
    } else if ("remove" in op) {
      const { variable } = op.remove;
      if (variables.items) {
        variables.items = variables.items.filter(
          (item) => item.key.value !== variable,
        );
      }
      removeFromGroups(doc, variable);
    } else if ("retype" in op) {
      const { variable, to, default: def } = op.retype;
      const pair = variables.items?.find(
        (item) => item.key.value === variable,
      );
      if (pair) {
        const val = (pair as unknown as { value: unknown }).value as {
          set: (k: string, v: unknown) => void;
        };
        val.set("type", to);
        if (def !== undefined) val.set("default", def);
      }
    }
  }
  return String(doc);
}

function renameInGroups(doc: unknown, from: string, to: string): void {
  const d = doc as { get: (k: string) => unknown };
  const groups = d.get("groups") as
    | {
        items?: Array<{
          value: {
            get: (k: string) => { items?: Array<{ value: string }> };
          };
        }>;
      }
    | undefined;
  if (!groups?.items) return;
  for (const g of groups.items) {
    const vars = g.value.get("variables");
    if (vars?.items) {
      for (const item of vars.items) {
        if (item.value === from) item.value = to;
      }
    }
  }
}

function removeFromGroups(doc: unknown, variable: string): void {
  const d = doc as { get: (k: string) => unknown };
  const groups = d.get("groups") as
    | {
        items?: Array<{
          value: {
            get: (k: string) => { items?: Array<{ value: string }> } | undefined;
          };
        }>;
      }
    | undefined;
  if (!groups?.items) return;
  for (const g of groups.items) {
    const vars = g.value.get("variables");
    if (vars?.items) {
      vars.items = vars.items.filter((i) => i.value !== variable);
    }
  }
}

export function applyToEnv(content: string, migration: MigrationFile): string {
  const lines = content.split("\n");
  const renames = new Map<string, string>();
  const removes = new Set<string>();
  for (const op of migration.migrations) {
    if ("rename" in op) renames.set(op.rename.from, op.rename.to);
    if ("remove" in op) removes.add(op.remove.variable);
  }
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const [, key, value] = m;
    if (removes.has(key)) continue;
    const mapped = renames.get(key) ?? key;
    out.push(`${mapped}=${value}`);
  }
  return out.join("\n");
}

export function applyToCode(content: string, migration: MigrationFile): string {
  let out = content;
  for (const op of migration.migrations) {
    if ("rename" in op) {
      const { from, to } = op.rename;
      const safe = escapeRegExp(from);
      // process.env.FOO / process.env["FOO"] / process.env['FOO']
      out = out.replace(
        new RegExp(`process\\.env\\.${safe}\\b`, "g"),
        `process.env.${to}`,
      );
      out = out.replace(
        new RegExp(`process\\.env\\["${safe}"\\]`, "g"),
        `process.env["${to}"]`,
      );
      out = out.replace(
        new RegExp(`process\\.env\\['${safe}'\\]`, "g"),
        `process.env['${to}']`,
      );
      // import.meta.env.FOO
      out = out.replace(
        new RegExp(`import\\.meta\\.env\\.${safe}\\b`, "g"),
        `import.meta.env.${to}`,
      );
      // os.environ["FOO"], os.environ.get("FOO"), os.getenv("FOO")
      out = out.replace(
        new RegExp(`os\\.environ\\[(["'])${safe}\\1\\]`, "g"),
        (_m, q: string) => `os.environ[${q}${to}${q}]`,
      );
      out = out.replace(
        new RegExp(`os\\.environ\\.get\\((["'])${safe}\\1`, "g"),
        (_m, q: string) => `os.environ.get(${q}${to}${q}`,
      );
      out = out.replace(
        new RegExp(`os\\.getenv\\((["'])${safe}\\1`, "g"),
        (_m, q: string) => `os.getenv(${q}${to}${q}`,
      );
      // ENV["FOO"] / ENV['FOO'] / ENV.fetch("FOO")
      out = out.replace(
        new RegExp(`ENV\\[(["'])${safe}\\1\\]`, "g"),
        (_m, q: string) => `ENV[${q}${to}${q}]`,
      );
      out = out.replace(
        new RegExp(`ENV\\.fetch\\((["'])${safe}\\1`, "g"),
        (_m, q: string) => `ENV.fetch(${q}${to}${q}`,
      );
      // Go / Rust / PHP
      out = out.replace(
        new RegExp(`os\\.Getenv\\("${safe}"\\)`, "g"),
        `os.Getenv("${to}")`,
      );
      out = out.replace(
        new RegExp(`env::var\\("${safe}"\\)`, "g"),
        `env::var("${to}")`,
      );
      out = out.replace(
        new RegExp(`getenv\\((["'])${safe}\\1\\)`, "g"),
        (_m, q: string) => `getenv(${q}${to}${q})`,
      );
      out = out.replace(
        new RegExp(`\\$_ENV\\[(["'])${safe}\\1\\]`, "g"),
        (_m, q: string) => `$_ENV[${q}${to}${q}]`,
      );
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function collectMigrationTargets(
  _migration: MigrationFile,
): { needsSchema: boolean; needsEnv: boolean; needsCode: boolean } {
  // All current ops touch schema; renames also touch env/code.
  return { needsSchema: true, needsEnv: true, needsCode: true };
}

/** Produce a unified-diff-ish representation for dry-run output. */
export function formatDiff(change: FileChange): string {
  const beforeLines = change.before.split("\n");
  const afterLines = change.after.split("\n");
  const lines: string[] = [`--- ${change.path}`, `+++ ${change.path}`];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) continue;
    if (b !== undefined) lines.push(`- ${b}`);
    if (a !== undefined) lines.push(`+ ${a}`);
  }
  return lines.join("\n");
}

/** Return a migration that undoes the given one (best effort). */
export function invertMigration(
  migration: MigrationFile,
): MigrationFile {
  const inverted: MigrationOp[] = [];
  for (const op of migration.migrations) {
    if ("rename" in op) {
      inverted.push({ rename: { from: op.rename.to, to: op.rename.from } });
    } else if ("remove" in op) {
      // Cannot resurrect values; we re-add the variable as a string placeholder.
      inverted.push({
        retype: { variable: op.remove.variable, to: "string" },
      });
    } else if ("retype" in op) {
      inverted.push({
        retype: { variable: op.retype.variable, to: "string" },
      });
    }
  }
  return { version: migration.version, migrations: inverted };
}
