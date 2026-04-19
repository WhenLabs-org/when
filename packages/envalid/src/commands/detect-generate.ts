import { writeFileSync } from "node:fs";
import type { EnvSchema, VariableSchema, SchemaValueType } from "../schema/types.js";
import type { FileLocation } from "../env/detector.js";
import { schemaToYaml } from "./init.js";

const SENSITIVE_PATTERN = /secret|key|token|password|api_key|private|credential/i;
const PORT_PATTERN = /port/i;
const URL_PATTERN = /url|uri|endpoint|host|href|origin/i;
const EMAIL_PATTERN = /email|mail/i;
const PATH_PATTERN = /path|dir|directory|folder|file/i;
const BOOL_PATTERN = /enabled?|disabled?|debug|verbose|allow|force|is_|has_|use_|should_|flag/i;

/**
 * Infer type and required-ness from variable name and code usage context.
 */
function inferFromContext(
  varName: string,
  locations: FileLocation[],
): Partial<VariableSchema> & { type: SchemaValueType } {
  let type: SchemaValueType = "string";
  let required = true;
  let description = "";
  let range: [number, number] | undefined;

  // Analyze all usage contexts
  for (const loc of locations) {
    const ctx = loc.context ?? "";

    // Detect fallbacks / defaults (means optional)
    // process.env.VAR || "default"
    // process.env.VAR ?? "default"
    // os.environ.get("VAR", "default")
    // os.getenv("VAR") or "default"
    if (
      /\|\||(?<!\?)\?\?/.test(ctx) ||
      /\.get\(["'][^"']+["'],\s*["']/.test(ctx) ||
      /\.get\(["'][^"']+["'],\s*\d/.test(ctx)
    ) {
      required = false;
    }

    // parseInt / Number() -> integer
    if (/parseInt\(|Number\(|~~|>>>|<<|\| 0|parseInt\s*\(/.test(ctx)) {
      type = "integer";
    }

    // parseFloat -> float
    if (/parseFloat\(/.test(ctx)) {
      type = "float";
    }

    // Boolean conversion or comparison to true/false
    if (/=== ?['"]true['"]|=== ?['"]false['"]|Boolean\(|!!/.test(ctx)) {
      type = "boolean";
    }

    // new URL() usage
    if (/new URL\(/.test(ctx)) {
      type = "url";
    }

    // JSON.parse usage
    if (/JSON\.parse\(/.test(ctx)) {
      type = "json";
    }

    // .split(",") or .split(", ") -> csv
    if (/\.split\(\s*["'][,;]/.test(ctx)) {
      type = "csv";
    }
  }

  // If code context didn't determine type, infer from variable name
  if (type === "string") {
    if (PORT_PATTERN.test(varName)) {
      type = "integer";
      range = [1, 65535];
    } else if (URL_PATTERN.test(varName)) {
      type = "url";
    } else if (EMAIL_PATTERN.test(varName)) {
      type = "email";
    } else if (PATH_PATTERN.test(varName)) {
      type = "path";
    } else if (BOOL_PATTERN.test(varName)) {
      type = "boolean";
    }
  }

  // Generate a human-readable description from the variable name
  description = generateDescription(varName);

  const result: Partial<VariableSchema> & { type: SchemaValueType } = {
    type,
    required,
    description,
  };

  if (range) {
    result.range = range;
  }

  if (SENSITIVE_PATTERN.test(varName)) {
    result.sensitive = true;
  }

  return result;
}

/**
 * Generate a human-readable description from a variable name.
 * e.g. DATABASE_URL -> "Database url", REDIS_PORT -> "Redis port"
 */
function generateDescription(varName: string): string {
  return varName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export interface GenerateSchemaResult {
  schema: EnvSchema;
  schemaPath: string;
  variableCount: number;
}

/**
 * Generate a .env.schema from detected env var usage in code.
 */
export function generateSchemaFromCode(
  envVarLocations: Record<string, FileLocation[]>,
  schemaPath: string,
): GenerateSchemaResult {
  const variables: Record<string, VariableSchema> = {};

  for (const [varName, locations] of Object.entries(envVarLocations)) {
    const inferred = inferFromContext(varName, locations);
    variables[varName] = {
      type: inferred.type,
      required: inferred.required ?? true,
      ...(inferred.description ? { description: inferred.description } : {}),
      ...(inferred.sensitive ? { sensitive: true } : {}),
      ...(inferred.range ? { range: inferred.range } : {}),
    } as VariableSchema;
  }

  // Sort variables alphabetically for consistent output
  const sortedVariables: Record<string, VariableSchema> = {};
  for (const key of Object.keys(variables).sort()) {
    sortedVariables[key] = variables[key];
  }

  const schema: EnvSchema = {
    version: 1,
    variables: sortedVariables,
  };

  const yamlContent = schemaToYaml(schema);
  writeFileSync(schemaPath, yamlContent, "utf-8");

  return {
    schema,
    schemaPath,
    variableCount: Object.keys(variables).length,
  };
}
