import type {
  EnvSchema,
  VariableSchema,
  ValidationResult,
  ValidationIssue,
} from "../schema/types.js";
import type { EnvFile } from "../env/reader.js";
import { validateValue } from "../schema/validators.js";

export interface ValidateOptions {
  environment?: string;
  ci?: boolean;
}

export function validate(
  schema: EnvSchema,
  envFile: EnvFile,
  options: ValidateOptions = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { environment, ci } = options;

  // 1. Check each schema variable against env values
  for (const [name, varSchema] of Object.entries(schema.variables)) {
    const value = envFile.variables[name];
    const isRequired = resolveRequired(varSchema, environment);

    if (value === undefined || value === "") {
      if (isRequired && varSchema.default === undefined) {
        issues.push({
          variable: name,
          severity: "error",
          message: "Missing required variable",
          expected: varSchema.type,
        });
      }
      continue;
    }

    // Run type validator
    const result = validateValue(value, varSchema);
    if (!result.valid) {
      issues.push({
        variable: name,
        severity: "error",
        message: result.message!,
        actual: varSchema.sensitive ? "[REDACTED]" : value,
        expected: varSchema.type,
      });
    }
  }

  // 2. Check for unknown variables (in env but not in schema)
  for (const name of Object.keys(envFile.variables)) {
    if (!schema.variables[name]) {
      issues.push({
        variable: name,
        severity: ci ? "error" : "warning",
        message: "Variable exists in .env but not in schema",
      });
    }
  }

  // 3. Check group constraints
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
              });
            }
          }
        }
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const missing = issues.filter((i) =>
    i.message.includes("Missing") || i.message.includes("Required in"),
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
    if (!environment) return true;
    return varSchema.environments.includes(environment);
  }
  return true;
}
