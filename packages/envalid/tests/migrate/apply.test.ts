import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrate } from "../../src/commands/migrate.js";
import { applyToCode, applyToEnv } from "../../src/migrate/apply.js";

const schemaYaml = [
  "version: 1",
  "variables:",
  "  DB_HOST:",
  "    type: string",
  "    required: true",
  "  LEGACY_TOKEN:",
  "    type: string",
  "    required: false",
  "  PORT:",
  "    type: string",
  "    required: true",
  "groups:",
  "  secrets:",
  "    variables:",
  "      - LEGACY_TOKEN",
  "",
].join("\n");

const migrationYaml = [
  "version: 1",
  "id: 2026-04-19-test",
  "migrations:",
  "  - rename: { from: DB_HOST, to: DATABASE_HOST }",
  "  - retype: { variable: PORT, to: integer, default: 3000 }",
  "  - remove: { variable: LEGACY_TOKEN }",
  "",
].join("\n");

describe("applyToEnv", () => {
  it("renames and removes variables", () => {
    const before = "DB_HOST=localhost\nLEGACY_TOKEN=abc\nPORT=3000\n";
    const after = applyToEnv(before, {
      version: 1,
      migrations: [
        { rename: { from: "DB_HOST", to: "DATABASE_HOST" } },
        { remove: { variable: "LEGACY_TOKEN" } },
      ],
    });
    expect(after).toContain("DATABASE_HOST=localhost");
    expect(after).not.toContain("DB_HOST=");
    expect(after).not.toContain("LEGACY_TOKEN=");
  });
});

describe("applyToCode", () => {
  it("rewrites common env access patterns", () => {
    const before = [
      'const h = process.env.DB_HOST;',
      'const h2 = process.env["DB_HOST"];',
      "host = os.environ['DB_HOST']",
      "os.getenv(\"DB_HOST\")",
      'ENV["DB_HOST"]',
      'env::var("DB_HOST")',
    ].join("\n");
    const after = applyToCode(before, {
      version: 1,
      migrations: [{ rename: { from: "DB_HOST", to: "DATABASE_HOST" } }],
    });
    expect(after).not.toContain("DB_HOST");
    expect(after.split("DATABASE_HOST").length - 1).toBe(6);
  });
});

describe("runMigrate", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "envalid-migrate-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies a migration end-to-end and records ledger", () => {
    writeFileSync(join(dir, ".env.schema"), schemaYaml);
    writeFileSync(
      join(dir, ".env"),
      "DB_HOST=localhost\nLEGACY_TOKEN=abc\nPORT=3000\n",
    );
    writeFileSync(
      join(dir, "app.ts"),
      "const h = process.env.DB_HOST;\n",
    );
    writeFileSync(join(dir, "mig.yaml"), migrationYaml);

    const result = runMigrate({
      cwd: dir,
      migrationPath: "mig.yaml",
      schemaPath: ".env.schema",
      envPaths: [".env"],
      codePaths: ["app.ts"],
    });

    expect(result.applied).toBe(true);
    expect(result.changes.length).toBe(3);

    const schema = readFileSync(join(dir, ".env.schema"), "utf-8");
    expect(schema).toContain("DATABASE_HOST:");
    expect(schema).not.toContain("DB_HOST:");
    expect(schema).not.toContain("LEGACY_TOKEN");
    expect(schema).toContain("type: integer");

    const envContent = readFileSync(join(dir, ".env"), "utf-8");
    expect(envContent).toContain("DATABASE_HOST=localhost");

    const code = readFileSync(join(dir, "app.ts"), "utf-8");
    expect(code).toContain("process.env.DATABASE_HOST");

    const ledger = JSON.parse(
      readFileSync(join(dir, ".envalid", "migrations.json"), "utf-8"),
    ) as { applied: Array<{ id: string; hash: string }> };
    expect(ledger.applied.length).toBe(1);
    expect(ledger.applied[0].id).toBe("2026-04-19-test");

    // Re-running is idempotent.
    const again = runMigrate({
      cwd: dir,
      migrationPath: "mig.yaml",
      schemaPath: ".env.schema",
      envPaths: [".env"],
      codePaths: ["app.ts"],
    });
    expect(again.applied).toBe(false);
    expect(again.reason).toMatch(/already applied/);
  });

  it("respects dry-run", () => {
    writeFileSync(join(dir, ".env.schema"), schemaYaml);
    writeFileSync(join(dir, ".env"), "DB_HOST=localhost\n");
    writeFileSync(join(dir, "mig.yaml"), migrationYaml);
    const result = runMigrate({
      cwd: dir,
      migrationPath: "mig.yaml",
      schemaPath: ".env.schema",
      envPaths: [".env"],
      dryRun: true,
    });
    const schema = readFileSync(join(dir, ".env.schema"), "utf-8");
    expect(schema).toContain("DB_HOST:");
    expect(result.diffs[0]).toContain("DATABASE_HOST:");
    expect(existsSync(join(dir, ".envalid"))).toBe(false);
  });
});
