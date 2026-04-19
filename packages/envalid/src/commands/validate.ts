import type {
  EnvSchema,
  VariableSchema,
  ValidationResult,
  ValidationIssue,
} from "../schema/types.js";
import type { EnvFile } from "../env/reader.js";
import { validateValue } from "../schema/validators.js";
import { closestMatch } from "../utils/strings.js";
import { pLimit } from "../utils/concurrency.js";
import {
  getDefaultRegistry,
  type Registry,
} from "../runtime/registry.js";
import { registerBuiltins } from "../runtime/builtins.js";

export interface ValidateOptions {
  environment?: string;
  ci?: boolean;
}

export interface ValidateAsyncOptions extends ValidateOptions {
  /** Run async/live validators. Default false. */
  checkLive?: boolean;
  concurrency?: number;
  registry?: Registry;
  signal?: AbortSignal;
}

let builtinsRegistered = false;
function ensureBuiltins(): void {
  if (builtinsRegistered) return;
  registerBuiltins(getDefaultRegistry());
  builtinsRegistered = true;
}

export function validate(
  schema: EnvSchema,
  envFile: EnvFile,
  options: ValidateOptions = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  collectStructuralIssues(schema, envFile, options, issues);

  for (const [name, varSchema] of Object.entries(schema.variables)) {
    const value = envFile.variables[name];
    if (value === undefined || value === "") continue;
    const result = validateValue(value, varSchema);
    if (!result.valid) {
      issues.push({
        variable: name,
        severity: "error",
        message: result.message!,
        actual: varSchema.sensitive ? "[REDACTED]" : value,
        expected: varSchema.type,
        kind: "invalid",
      });
    }
  }

  return finalize(schema, sortIssues(issues));
}

export async function validateAsync(
  schema: EnvSchema,
  envFile: EnvFile,
  options: ValidateAsyncOptions = {},
): Promise<ValidationResult> {
  ensureBuiltins();
  const registry = options.registry ?? getDefaultRegistry();
  const limit = pLimit(options.concurrency ?? 8);
  const live = options.checkLive ?? false;

  const issues: ValidationIssue[] = [];
  collectStructuralIssues(schema, envFile, options, issues);

  const tasks: Promise<void>[] = [];
  for (const [name, varSchema] of Object.entries(schema.variables)) {
    const value = envFile.variables[name];
    if (value === undefined || value === "") continue;
    const def = registry.getValidator(varSchema.type);
    if (!def) {
      issues.push({
        variable: name,
        severity: "error",
        message: `Unknown type "${varSchema.type}"`,
        kind: "invalid",
      });
      continue;
    }
    if (def.async && !live) {
      issues.push({
        variable: name,
        severity: "info",
        message: `Skipped live check for ${varSchema.type} (pass --check-live to run)`,
        kind: "live-check-skipped",
      });
      continue;
    }
    tasks.push(
      limit(async () => {
        const result = await def.validate(value, varSchema, {
          env: envFile.variables,
          name,
          live,
          signal: options.signal,
        });
        if (!result.valid) {
          issues.push({
            variable: name,
            severity: "error",
            message: result.message,
            actual: varSchema.sensitive ? "[REDACTED]" : value,
            expected: varSchema.type,
            kind: def.async ? "live-check-failed" : "invalid",
          });
        }
      }),
    );
  }

  await Promise.all(tasks);

  return finalize(schema, sortIssues(issues));
}

function collectStructuralIssues(
  schema: EnvSchema,
  envFile: EnvFile,
  options: ValidateOptions,
  issues: ValidationIssue[],
): void {
  const { environment, ci } = options;

  for (const [name, varSchema] of Object.entries(schema.variables)) {
    const value = envFile.variables[name];
    const isRequired = resolveRequired(varSchema, environment);
    if ((value === undefined || value === "") && isRequired &&
      varSchema.default === undefined) {
      issues.push({
        variable: name,
        severity: "error",
        message: "Missing required variable",
        expected: varSchema.type,
        kind: "missing",
      });
    }
  }

  const schemaNames = Object.keys(schema.variables);
  for (const name of Object.keys(envFile.variables)) {
    if (!schema.variables[name]) {
      const suggestion = closestMatch(name, schemaNames);
      issues.push({
        variable: name,
        severity: ci ? "error" : "warning",
        message: "Variable exists in .env but not in schema",
        kind: "unknown-variable",
        ...(suggestion ? { suggestion: `did you mean ${suggestion}?` } : {}),
      });
    }
  }

  if (schema.groups && environment) {
    for (const [groupName, group] of Object.entries(schema.groups)) {
      if (group.required_in?.includes(environment)) {
        for (const varName of group.variables) {
          const value = envFile.variables[varName];
          if (value === undefined || value === "") {
            const alreadyReported = issues.some(
              (i) => i.variable === varName && i.severity === "error",
            );
            if (!alreadyReported) {
              issues.push({
                variable: varName,
                severity: "error",
                message: `Required in ${environment} (group: ${groupName})`,
                kind: "group",
              });
            }
          }
        }
      }
    }
  }
}

function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((a, b) => {
    if (a.variable !== b.variable) return a.variable.localeCompare(b.variable);
    return (a.kind ?? "").localeCompare(b.kind ?? "");
  });
}

function finalize(
  schema: EnvSchema,
  issues: ValidationIssue[],
): ValidationResult {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const missing = issues.filter(
    (i) => i.kind === "missing" || i.kind === "group",
  ).length;
  return {
    valid: errors === 0,
    issues,
    stats: {
      total: Object.keys(schema.variables).length,
      valid: Object.keys(schema.variables).length - errors,
      errors,
      warnings,
      missing,
    },
  };
}

function resolveRequired(
  varSchema: VariableSchema,
  environment?: string,
): boolean {
  if (!varSchema.required) return false;
  if (varSchema.environments) {
    if (!environment) return false;
    return varSchema.environments.includes(environment);
  }
  return true;
}
