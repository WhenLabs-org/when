import { Command } from "commander";
import chalk from "chalk";
import { parseSchemaFile } from "./schema/parser.js";
import { loadSchema } from "./schema/loader.js";
import { readEnvFile } from "./env/reader.js";
import { validate, validateAsync } from "./commands/validate.js";
import { runInit } from "./commands/init.js";
import { diffEnvFiles } from "./commands/diff.js";
import { runGenerateExample } from "./commands/generate.js";
import { syncCheck } from "./commands/sync.js";
import { createReporter, type ReporterFormat } from "./reporters/index.js";
import { runOnboard } from "./commands/onboard.js";
import {
  runHookInstall,
  runHookUninstall,
  runHookStatus,
} from "./commands/hook.js";
import { detectEnvUsage, detectEnvVarsInCode } from "./env/detector.js";
import { generateSchemaFromCode } from "./commands/detect-generate.js";
import { scanSecrets } from "./commands/secrets.js";
import { EnvalidError } from "./errors.js";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { loadPlugins } from "./runtime/plugin.js";
import { getDefaultRegistry } from "./runtime/registry.js";
import { registerBuiltins } from "./runtime/builtins.js";
import { runCodegen } from "./commands/codegen.js";
import { runExport } from "./commands/export.js";
import { runWatch } from "./commands/watch.js";
import { runFix } from "./commands/fix.js";
import { runMigrate } from "./commands/migrate.js";
import {
  resolveSecrets,
  parseSecretRef,
} from "./providers/index.js";
import inquirer from "inquirer";

const program = new Command();

program
  .name("envalid")
  .description("Type safety for .env files")
  .version("0.3.0");

let pluginsInitialized = false;
async function initializeRuntime() {
  if (pluginsInitialized) return;
  registerBuiltins(getDefaultRegistry());
  const config = await loadConfig();
  await loadPlugins(getDefaultRegistry(), config.plugins);
  pluginsInitialized = true;
  return config;
}

// --- validate ---
program
  .command("validate")
  .description("Validate .env against schema")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .option("--environment <name>", "Target environment (e.g. production)")
  .option("--ci", "CI mode: exit 1 on any issue", false)
  .option("--check-live", "Run async/live validators and resolve secret refs", false)
  .option("--no-resolve-secrets", "Disable secret reference resolution")
  .option("--concurrency <n>", "Max concurrent async validators", (v) => Number(v), 8)
  .option(
    "-f, --format <format>",
    "Output format: terminal, json, markdown",
    "terminal",
  )
  .action(async (options) => {
    await initializeRuntime();
    if (!existsSync(options.schema)) {
      console.error(chalk.red(`Error: Schema file not found: ${options.schema}`));
      console.log("");
      console.log("  No .env.schema found. Generate one with:");
      console.log("");
      console.log(chalk.cyan("    envalid detect --generate") + chalk.dim("    (from code analysis)"));
      console.log(chalk.cyan("    envalid init") + chalk.dim("              (from existing .env file)"));
      console.log("");
      process.exit(2);
    }
    const schema = loadSchema(options.schema);
    let envFile = readEnvFile(options.env);

    const secretIssues: Array<{ variable: string; kind: string; message: string; severity: string }> = [];
    if (options.resolveSecrets !== false) {
      const hasRefs = Object.values(envFile.variables).some((v) =>
        parseSecretRef(v),
      );
      if (hasRefs) {
        const res = await resolveSecrets(envFile.variables, {
          registry: getDefaultRegistry(),
          live: options.checkLive === true,
        });
        envFile = { ...envFile, variables: res.variables };
        for (const r of res.results) {
          if (r.ok) continue;
          secretIssues.push({
            variable: r.variable,
            severity: options.checkLive ? "error" : "info",
            kind: options.checkLive
              ? "secret-resolution-failed"
              : "secret-resolution-skipped",
            message: `Secret @${r.scheme}: ${r.error ?? "unresolved"}`,
          });
        }
      }
    }

    const result = await validateAsync(schema, envFile, {
      environment: options.environment,
      ci: options.ci,
      checkLive: options.checkLive === true,
      concurrency: options.concurrency,
    });
    // Splice secret issues into the result.
    for (const si of secretIssues) {
      result.issues.push(si as never);
      if (si.severity === "error") {
        result.stats.errors++;
        result.valid = false;
      }
    }
    const reporter = createReporter(options.format as ReporterFormat);
    console.log(reporter.reportValidation(result));
    if (!result.valid) process.exit(1);
  });

// --- init ---
program
  .command("init")
  .description("Generate .env.schema from existing .env file")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .option("-o, --output <path>", "Output schema file path", ".env.schema")
  .option("--force", "Overwrite existing schema", false)
  .action((options) => {
    const result = runInit({
      envPath: options.env,
      schemaPath: options.output,
      force: options.force,
    });
    if (result.created) {
      console.log(chalk.green(`✓ ${result.message}`));
      console.log(`  Schema written to ${chalk.bold(result.schemaPath)}`);
    } else {
      console.log(chalk.yellow(`⚠ ${result.message}`));
    }
  });

// --- diff ---
program
  .command("diff <source> <target>")
  .description("Compare two .env files")
  .option("-s, --schema <path>", "Path to .env.schema (for sensitivity info)")
  .option(
    "-f, --format <format>",
    "Output format: terminal, json, markdown",
    "terminal",
  )
  .action((source, target, options) => {
    const sourceFile = readEnvFile(source);
    const targetFile = readEnvFile(target);
    const schema = options.schema
      ? parseSchemaFile(options.schema)
      : undefined;
    const result = diffEnvFiles(sourceFile, targetFile, schema);
    const reporter = createReporter(options.format as ReporterFormat);
    console.log(reporter.reportDiff(result));
  });

// --- generate-example ---
program
  .command("generate-example")
  .description("Generate .env.example from schema")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-o, --output <path>", "Output file path", ".env.example")
  .action((options) => {
    const schema = parseSchemaFile(options.schema);
    runGenerateExample({ schema, outputPath: options.output });
    console.log(
      chalk.green(`✓ Generated ${chalk.bold(options.output)} from schema`),
    );
  });

// --- sync ---
program
  .command("sync")
  .description("Check multiple environments against schema")
  .requiredOption(
    "--environments <paths>",
    "Comma-separated env file paths",
  )
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("--ci", "CI mode: exit 1 on any issue", false)
  .option(
    "-f, --format <format>",
    "Output format: terminal, json, markdown",
    "terminal",
  )
  .action((options) => {
    const schema = parseSchemaFile(options.schema);
    const paths = (options.environments as string)
      .split(",")
      .map((p: string) => p.trim());
    const results = syncCheck(schema, paths, { ci: options.ci });
    const reporter = createReporter(options.format as ReporterFormat);
    console.log(reporter.reportSync(results));
    const anyFailed = [...results.values()].some((r) => !r.valid);
    if (anyFailed) process.exit(1);
  });

// --- onboard ---
program
  .command("onboard")
  .description("Interactive guided setup for new developers")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-o, --output <path>", "Output .env file path", ".env")
  .action(async (options) => {
    const schema = parseSchemaFile(options.schema);
    await runOnboard(schema, options.output);
  });

// --- hook ---
const hookCmd = program
  .command("hook")
  .description("Manage git pre-commit hook");

hookCmd
  .command("install")
  .description("Install pre-commit validation hook")
  .action(() => {
    runHookInstall();
  });

hookCmd
  .command("uninstall")
  .description("Remove pre-commit validation hook")
  .action(() => {
    runHookUninstall();
  });

hookCmd
  .command("status")
  .description("Check if hook is installed")
  .action(() => {
    runHookStatus();
  });

// --- detect ---
program
  .command("detect")
  .description("Scan codebase for env var usage and compare with schema")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-d, --dir <path>", "Root directory to scan", ".")
  .option("--exclude <dirs>", "Comma-separated directories to exclude")
  .option("--generate", "Auto-generate .env.schema from detected env vars", false)
  .option("-o, --output <path>", "Output schema path (used with --generate)", ".env.schema")
  .option(
    "-f, --format <format>",
    "Output format: terminal, json",
    "terminal",
  )
  .action((options) => {
    const exclude = options.exclude
      ? (options.exclude as string).split(",").map((s: string) => s.trim())
      : undefined;

    // --generate mode: scan code and produce a schema without needing an existing one
    if (options.generate) {
      const envVarLocations = detectEnvVarsInCode(options.dir, { exclude });
      const varNames = Object.keys(envVarLocations);

      if (varNames.length === 0) {
        console.log(chalk.yellow("\n  No env var usage found in code.\n"));
        return;
      }

      const result = generateSchemaFromCode(envVarLocations, options.output);

      if (options.format === "json") {
        console.log(JSON.stringify(result.schema, null, 2));
        return;
      }

      console.log("");
      console.log(chalk.green(`  ✓ Generated ${chalk.bold(options.output)} with ${result.variableCount} variables`));
      console.log("");
      for (const [name, varSchema] of Object.entries(result.schema.variables)) {
        const flags = [
          varSchema.type,
          varSchema.required ? "required" : "optional",
          varSchema.sensitive ? "sensitive" : null,
        ].filter(Boolean).join(", ");
        console.log(`    ${chalk.bold(name)} ${chalk.dim(`(${flags})`)}`);
      }
      console.log("");
      console.log(chalk.dim("  Review the generated schema and adjust types/requirements as needed."));
      return;
    }

    // Normal detect mode: compare code usage against existing schema.
    // If no schema exists yet, fall back to a schema-free listing so
    // `detect` still works on projects that haven't run --generate yet.
    if (!existsSync(options.schema)) {
      const envVarLocations = detectEnvVarsInCode(options.dir, { exclude });
      const varNames = Object.keys(envVarLocations).sort();

      if (options.format === "json") {
        console.log(JSON.stringify({
          schema: null,
          usedInCode: varNames,
          locations: envVarLocations,
        }, null, 2));
        return;
      }

      console.log("");
      if (varNames.length === 0) {
        console.log(chalk.yellow("  No env var usage found in code."));
        console.log("");
        return;
      }
      console.log(
        chalk.yellow(
          `  ⚠ No schema at ${options.schema} — showing env vars used in code (${varNames.length}):`,
        ),
      );
      for (const v of varNames) {
        const locs = envVarLocations[v];
        const locStr = locs
          ? locs.map((l) => `${l.file}:${l.line}`).join(", ")
          : "";
        console.log(
          `    ${chalk.yellow("+")} ${v}${locStr ? chalk.dim(`  used at ${locStr}`) : ""}`,
        );
      }
      console.log("");
      console.log(chalk.dim(`  Run \`envalid detect --generate\` to create ${options.schema} from these.`));
      console.log("");
      return;
    }

    const schema = parseSchemaFile(options.schema);
    const result = detectEnvUsage(options.dir, schema, {
      exclude,
    });

    if (options.format === "json") {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("");
    if (result.usedNotInSchema.length > 0) {
      console.log(
        chalk.yellow(
          `  ⚠ Used in code but not in schema (${result.usedNotInSchema.length}):`,
        ),
      );
      for (const v of result.usedNotInSchema) {
        const locs = result.locations[v];
        const locStr = locs
          ? locs.map((l) => `${l.file}:${l.line}`).join(", ")
          : "";
        console.log(
          `    ${chalk.yellow("+")} ${v}${locStr ? chalk.dim(`  used at ${locStr}`) : ""}`,
        );
      }
      console.log("");
    }

    if (result.inSchemaNotUsed.length > 0) {
      console.log(
        chalk.dim(
          `  ℹ In schema but not found in code (${result.inSchemaNotUsed.length}):`,
        ),
      );
      for (const v of result.inSchemaNotUsed) {
        console.log(`    ${chalk.dim("-")} ${v}`);
      }
      console.log("");
    }

    if (
      result.usedNotInSchema.length === 0 &&
      result.inSchemaNotUsed.length === 0
    ) {
      console.log(
        chalk.green("  ✓ Schema and code are in sync"),
      );
    }

    console.log(
      chalk.dim(
        `  Found ${result.usedInCode.length} env vars referenced in code`,
      ),
    );
  });

// --- secrets ---
program
  .command("secrets")
  .description("Scan committed files for leaked secrets")
  .option("-d, --dir <path>", "Root directory to scan", ".")
  .option("--exclude <dirs>", "Comma-separated directories to exclude")
  .option(
    "-f, --format <format>",
    "Output format: terminal, json",
    "terminal",
  )
  .action((options) => {
    const exclude = options.exclude
      ? (options.exclude as string).split(",").map((s: string) => s.trim())
      : undefined;
    const result = scanSecrets(options.dir, { exclude });

    if (options.format === "json") {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("");
    if (result.findings.length > 0) {
      console.log(
        chalk.red(
          `  ⚠ Found ${result.findings.length} potential secret(s):`,
        ),
      );
      console.log("");
      for (const f of result.findings) {
        console.log(
          `    ${chalk.red("!")} ${chalk.bold(f.variable)} at ${chalk.dim(`${f.file}:${f.line}`)} ${chalk.dim(`[${f.pattern}]`)}`,
        );
      }
      console.log("");
    } else {
      console.log(chalk.green("  ✓ No secrets detected"));
    }

    console.log(
      chalk.dim(`  Scanned ${result.filesScanned} files`),
    );
    if (result.findings.length > 0) process.exit(1);
  });

// --- codegen ---
program
  .command("codegen")
  .description("Generate a typed env.ts client from the schema")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-o, --output <path>", "Output file path", "src/env.ts")
  .option("--runtime <runtime>", "process | import-meta", "process")
  .action(async (options) => {
    await initializeRuntime();
    const schema = loadSchema(options.schema);
    runCodegen({
      schema,
      outputPath: options.output,
      schemaPath: options.schema,
      runtime: options.runtime,
    });
    console.log(
      chalk.green(`✓ Wrote ${chalk.bold(options.output)} (${Object.keys(schema.variables).length} vars)`),
    );
  });

// --- export ---
program
  .command("export")
  .description("Export schema as JSON Schema or OpenAPI component")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-f, --format <format>", "json-schema | openapi", "json-schema")
  .option("-o, --output <path>", "Output file path")
  .option("--pretty", "Pretty-print JSON", false)
  .option("--openapi-version <v>", "OpenAPI version (3.0 or 3.1)", "3.1")
  .action(async (options) => {
    await initializeRuntime();
    const schema = loadSchema(options.schema);
    const json = runExport({
      schema,
      format: options.format,
      outputPath: options.output,
      pretty: options.pretty,
      openapiVersion: options.openapiVersion,
    });
    if (!options.output) console.log(json);
    else console.log(chalk.green(`✓ Wrote ${chalk.bold(options.output)}`));
  });

// --- watch ---
program
  .command("watch")
  .description("Watch schema + .env and revalidate on change")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .option("--environment <name>", "Target environment")
  .option("-f, --format <format>", "terminal | json | markdown", "terminal")
  .action(async (options) => {
    await initializeRuntime();
    const stop = runWatch({
      schemaPath: options.schema,
      envPath: options.env,
      environment: options.environment,
      format: options.format as ReporterFormat,
    });
    process.on("SIGINT", () => {
      stop();
      process.exit(0);
    });
    console.log(chalk.dim("\n[envalid] watching… Ctrl-C to exit\n"));
    await new Promise(() => {
      /* run forever */
    });
  });

// --- fix ---
program
  .command("fix")
  .description("Interactively fix validation errors in a .env file")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .option("-o, --output <path>", "Where to write the fixed file")
  .option("--environment <name>", "Target environment")
  .option("--auto", "Non-interactive: use defaults where available", false)
  .action(async (options) => {
    await initializeRuntime();
    const schema = loadSchema(options.schema);
    const envFile = readEnvFile(options.env);
    const result = await runFix({
      schema,
      envFile,
      outputPath: options.output,
      environment: options.environment,
      auto: options.auto,
      prompt: options.auto
        ? undefined
        : async (issue, varSchema) => {
            const { value } = await inquirer.prompt<{ value: string }>([
              {
                type: varSchema?.sensitive ? "password" : "input",
                name: "value",
                message: `${issue.variable} (${varSchema?.type ?? "?"}) → ${issue.message}\n  Replacement (empty to skip):`,
                default:
                  varSchema?.default !== undefined
                    ? String(varSchema.default)
                    : undefined,
              },
            ]);
            return value.trim() === "" ? undefined : value;
          },
    });
    console.log("");
    console.log(
      chalk.green(`  ✓ Applied ${result.applied} fix(es)`),
      chalk.dim(`(${result.skipped} skipped, ${result.remaining.length} remaining)`),
    );
  });

// --- migrate ---
program
  .command("migrate")
  .description("Apply a migration file to schema/.env/code")
  .requiredOption("-f, --file <path>", "Migration YAML file")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("--env <paths>", "Comma-separated .env files")
  .option("--code <paths>", "Comma-separated code file globs (simple paths)")
  .option("--dry-run", "Print diffs without writing", false)
  .option("--no-backup", "Disable .envalid/backups/<id>/ copies")
  .option("--force", "Re-apply even if already applied", false)
  .action(async (options) => {
    await initializeRuntime();
    const result = runMigrate({
      migrationPath: options.file,
      schemaPath: options.schema,
      envPaths: options.env ? String(options.env).split(",") : undefined,
      codePaths: options.code ? String(options.code).split(",") : undefined,
      dryRun: options.dryRun,
      backup: options.backup !== false,
      force: options.force,
    });
    if (result.reason) {
      console.log(chalk.yellow(`⚠ ${result.reason}`));
      return;
    }
    if (options.dryRun) {
      for (const diff of result.diffs) console.log(diff + "\n");
      return;
    }
    console.log(
      chalk.green(`✓ Migration applied. ${result.changes.length} file(s) changed.`),
    );
  });

// Global error handling
const run = async () => {
  try {
    await program.parseAsync();
  } catch (err) {
    if (err instanceof EnvalidError) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(2);
    }
    throw err;
  }
};

run();
