import { Command } from "commander";
import chalk from "chalk";
import { parseSchemaFile } from "./schema/parser.js";
import { readEnvFile } from "./env/reader.js";
import { validate } from "./commands/validate.js";
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
import { detectEnvUsage } from "./env/detector.js";
import { scanSecrets } from "./commands/secrets.js";
import { EnvalidError } from "./errors.js";

const program = new Command();

program
  .name("envalid")
  .description("Type safety for .env files")
  .version("0.1.0");

// --- validate ---
program
  .command("validate")
  .description("Validate .env against schema")
  .option("-s, --schema <path>", "Path to .env.schema", ".env.schema")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .option("--environment <name>", "Target environment (e.g. production)")
  .option("--ci", "CI mode: exit 1 on any issue", false)
  .option(
    "-f, --format <format>",
    "Output format: terminal, json, markdown",
    "terminal",
  )
  .action((options) => {
    const schema = parseSchemaFile(options.schema);
    const envFile = readEnvFile(options.env);
    const result = validate(schema, envFile, {
      environment: options.environment,
      ci: options.ci,
    });
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
  .option(
    "-f, --format <format>",
    "Output format: terminal, json",
    "terminal",
  )
  .action((options) => {
    const schema = parseSchemaFile(options.schema);
    const exclude = options.exclude
      ? (options.exclude as string).split(",").map((s: string) => s.trim())
      : undefined;
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
