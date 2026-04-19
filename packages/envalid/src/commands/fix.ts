import type {
  EnvSchema,
  ValidationIssue,
  VariableSchema,
} from "../schema/types.js";
import type { EnvFile } from "../env/reader.js";
import { validate } from "./validate.js";
import { writeEnvFile } from "../env/writer.js";
import { validateValue } from "../schema/validators.js";

export interface FixOptions {
  environment?: string;
  /** Non-interactive: use defaults where available, else drop the issue. */
  auto?: boolean;
  /**
   * Prompt function. Returns the user-provided replacement, or undefined to
   * skip. Swapped in tests.
   */
  prompt?: (
    issue: ValidationIssue,
    varSchema: VariableSchema | undefined,
  ) => Promise<string | undefined>;
}

export interface FixResult {
  applied: number;
  skipped: number;
  variables: Record<string, string>;
  /** Issues that could not be auto-resolved. */
  remaining: ValidationIssue[];
}

/**
 * Apply fixes for issues returned by `validate`. Returns the patched env
 * variables and a summary; callers choose whether to persist with
 * `writeEnvFile`.
 */
export async function applyFixes(
  schema: EnvSchema,
  envFile: EnvFile,
  options: FixOptions = {},
): Promise<FixResult> {
  const result = validate(schema, envFile, {
    environment: options.environment,
  });
  const variables = { ...envFile.variables };
  const remaining: ValidationIssue[] = [];
  let applied = 0;
  let skipped = 0;

  for (const issue of result.issues) {
    if (issue.severity !== "error") {
      remaining.push(issue);
      continue;
    }
    const varSchema = schema.variables[issue.variable];

    // Unknown-variable: apply suggested rename if any (no type validation needed).
    if (issue.kind === "unknown-variable") {
      const suggestion = extractSuggestion(issue);
      if (suggestion) {
        const value = variables[issue.variable];
        if (value !== undefined) {
          delete variables[issue.variable];
          variables[suggestion] = value;
          applied++;
          continue;
        }
      }
      remaining.push(issue);
      continue;
    }

    if (!varSchema) {
      remaining.push(issue);
      continue;
    }

    let replacement: string | undefined;
    if (options.auto) {
      if (varSchema.default !== undefined) {
        replacement = String(varSchema.default);
      }
    } else if (options.prompt) {
      replacement = await options.prompt(issue, varSchema);
    }

    if (replacement === undefined) {
      remaining.push(issue);
      skipped++;
      continue;
    }

    const check = validateValue(replacement, varSchema);
    if (!check.valid) {
      remaining.push({
        ...issue,
        message: `Replacement rejected: ${check.message}`,
      });
      skipped++;
      continue;
    }
    variables[issue.variable] = replacement;
    applied++;
  }

  return { applied, skipped, variables, remaining };
}

export interface PersistFixesOptions extends FixOptions {
  schema: EnvSchema;
  envFile: EnvFile;
  outputPath?: string;
}

export async function runFix(
  options: PersistFixesOptions,
): Promise<FixResult> {
  const result = await applyFixes(options.schema, options.envFile, options);
  writeEnvFile({
    filePath: options.outputPath ?? options.envFile.path,
    variables: result.variables,
  });
  return result;
}

function extractSuggestion(issue: ValidationIssue): string | undefined {
  if (!issue.suggestion) return undefined;
  const m = issue.suggestion.match(/did you mean ([A-Za-z0-9_]+)\??/);
  return m ? m[1] : undefined;
}
