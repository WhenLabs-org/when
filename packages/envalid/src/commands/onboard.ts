import inquirer from "inquirer";
import chalk from "chalk";
import type { EnvSchema, VariableSchema } from "../schema/types.js";
import { validateValue } from "../schema/validators.js";
import { writeEnvFile } from "../env/writer.js";

interface OnboardResult {
  configured: number;
  skipped: number;
  defaults: number;
  total: number;
  filePath: string;
}

function formatTypeHint(varSchema: VariableSchema): string {
  switch (varSchema.type) {
    case "enum":
      return `One of: ${varSchema.values?.join(", ")}`;
    case "boolean":
      return "true/false/1/0";
    case "integer":
      return varSchema.range
        ? `Integer [${varSchema.range[0]}-${varSchema.range[1]}]`
        : "Integer";
    case "float":
      return varSchema.range
        ? `Float [${varSchema.range[0]}-${varSchema.range[1]}]`
        : "Float";
    case "url":
      return varSchema.protocol
        ? `URL (${varSchema.protocol.join("/")} protocol)`
        : "URL";
    case "email":
      return "Email address";
    case "csv":
      return "Comma-separated values";
    case "json":
      return "Valid JSON";
    case "semver":
      return "Semver (e.g. 1.2.3)";
    case "path":
      return "File/directory path";
    default:
      return varSchema.pattern
        ? `String matching: ${varSchema.pattern}`
        : "String";
  }
}

export async function runOnboard(
  schema: EnvSchema,
  outputPath: string,
): Promise<OnboardResult> {
  const variables: Record<string, string> = {};
  const entries = Object.entries(schema.variables);
  let configured = 0;
  let skipped = 0;
  let defaults = 0;

  // Separate required (no default) vars that need input from those with defaults
  const needsInput: [string, VariableSchema][] = [];
  const hasDefault: [string, VariableSchema][] = [];

  for (const [name, varSchema] of entries) {
    if (varSchema.default !== undefined) {
      hasDefault.push([name, varSchema]);
    } else if (varSchema.required) {
      needsInput.push([name, varSchema]);
    } else {
      hasDefault.push([name, varSchema]); // optional with no default — will skip
    }
  }

  console.log("");
  console.log(
    chalk.bold("Welcome! Let's set up your environment."),
  );
  console.log("");
  console.log(
    `This project requires ${chalk.bold(String(entries.length))} environment variables.`,
  );
  console.log(
    `${hasDefault.length} have defaults, ${needsInput.length} need your input.`,
  );
  console.log("");

  // Apply defaults first
  for (const [name, varSchema] of hasDefault) {
    if (varSchema.default !== undefined) {
      variables[name] = String(varSchema.default);
      defaults++;
    }
  }

  // Prompt for required vars without defaults
  for (let i = 0; i < needsInput.length; i++) {
    const [name, varSchema] = needsInput[i];
    const hint = formatTypeHint(varSchema);

    console.log(
      chalk.cyan(
        `[${i + 1}/${needsInput.length}] ${chalk.bold(name)}${varSchema.required ? "" : " (optional)"}`,
      ),
    );
    if (varSchema.description) {
      console.log(`  ${chalk.dim("→")} ${varSchema.description}`);
    }
    console.log(`  ${chalk.dim("→")} Format: ${hint}`);
    if (varSchema.sensitive) {
      console.log(`  ${chalk.dim("→")} ${chalk.yellow("Sensitive value — will be masked")}`);
    }

    // For enum types, use a list prompt
    if (varSchema.type === "enum" && varSchema.values) {
      const { value } = await inquirer.prompt([
        {
          type: "list",
          name: "value",
          message: `Select ${name}:`,
          choices: varSchema.values,
        },
      ]);
      variables[name] = value;
      configured++;
      console.log(chalk.green(`  ✓ Set to "${value}"`));
      console.log("");
      continue;
    }

    // Allow skipping optional vars
    if (!varSchema.required) {
      const { skip } = await inquirer.prompt([
        {
          type: "confirm",
          name: "skip",
          message: "Skip for now?",
          default: true,
        },
      ]);
      if (skip) {
        skipped++;
        console.log(chalk.yellow("  ⚠ Skipped"));
        console.log("");
        continue;
      }
    }

    // Input prompt with validation
    let valid = false;
    while (!valid) {
      const { value } = await inquirer.prompt([
        {
          type: varSchema.sensitive ? "password" : "input",
          name: "value",
          message: `Enter ${name}:`,
          validate: (input: string) => {
            if (!input && varSchema.required) {
              return "This variable is required";
            }
            if (input) {
              const result = validateValue(input, varSchema);
              if (!result.valid) return result.message!;
            }
            return true;
          },
        },
      ]);

      variables[name] = value;
      configured++;
      valid = true;

      const displayValue = varSchema.sensitive ? "****" : value;
      console.log(chalk.green(`  ✓ Valid ${varSchema.type}: ${displayValue}`));
      console.log("");
    }
  }

  // Write the env file
  const comments: Record<string, string> = {};
  for (const [name, varSchema] of entries) {
    if (varSchema.description) {
      comments[name] = varSchema.description;
    }
  }

  writeEnvFile({ variables, comments, filePath: outputPath });

  console.log(chalk.green.bold("─".repeat(40)));
  console.log(
    chalk.green(
      `✓ .env file created with ${Object.keys(variables).length} variables`,
    ),
  );
  console.log(
    `  ${defaults} defaults applied, ${configured} configured, ${skipped} skipped`,
  );
  if (skipped > 0) {
    console.log(
      chalk.yellow(
        `  ⚠ ${skipped} skipped — run ${chalk.bold("envalid validate")} to check later`,
      ),
    );
  }

  return {
    configured,
    skipped,
    defaults,
    total: entries.length,
    filePath: outputPath,
  };
}
