import { existsSync } from "node:fs";
import YAML from "yaml";
import type { EnvSchema, VariableSchema, SchemaValueType } from "../schema/types.js";
import { readEnvFile } from "../env/reader.js";
import { writeFileSync } from "node:fs";

const SENSITIVE_PATTERN = /secret|key|token|password|api_key|private/i;

export function inferType(
  key: string,
  value: string,
): Partial<VariableSchema> & { type: SchemaValueType } {
  // Check specific patterns first (order matters)
  if (
    value.toLowerCase() === "true" ||
    value.toLowerCase() === "false" ||
    value === "1" ||
    value === "0"
  ) {
    return { type: "boolean", required: true };
  }

  if (/^-?\d+$/.test(value) && Number.isInteger(Number(value))) {
    return { type: "integer", required: true };
  }

  if (/^-?\d+\.\d+$/.test(value) && !isNaN(parseFloat(value))) {
    return { type: "float", required: true };
  }

  try {
    const url = new URL(value);
    if (url.protocol && url.host) {
      return { type: "url", required: true };
    }
  } catch {
    // not a URL
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { type: "email", required: true };
  }

  if (/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(value)) {
    return { type: "semver", required: true };
  }

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) {
      return { type: "json", required: true };
    }
  } catch {
    // not JSON
  }

  if (value.includes(",")) {
    return { type: "csv", required: true };
  }

  const sensitive = SENSITIVE_PATTERN.test(key);
  return { type: "string", required: true, ...(sensitive ? { sensitive: true } : {}) };
}

export function generateSchema(envFile: { variables: Record<string, string> }): EnvSchema {
  const variables: Record<string, VariableSchema> = {};

  for (const [key, value] of Object.entries(envFile.variables)) {
    const inferred = inferType(key, value);
    variables[key] = {
      type: inferred.type,
      required: inferred.required ?? true,
      ...(inferred.sensitive ? { sensitive: true } : {}),
    } as VariableSchema;
  }

  return {
    version: 1,
    variables,
  };
}

export function schemaToYaml(schema: EnvSchema): string {
  return YAML.stringify(schema, { lineWidth: 0 });
}

export interface InitOptions {
  envPath: string;
  schemaPath: string;
  force?: boolean;
}

export function runInit(options: InitOptions): {
  created: boolean;
  message: string;
  schemaPath: string;
} {
  const { envPath, schemaPath, force } = options;

  if (existsSync(schemaPath) && !force) {
    return {
      created: false,
      message: `Schema file already exists at ${schemaPath}. Use --force to overwrite.`,
      schemaPath,
    };
  }

  const envFile = readEnvFile(envPath);
  const schema = generateSchema(envFile);
  const yamlContent = schemaToYaml(schema);
  writeFileSync(schemaPath, yamlContent, "utf-8");

  return {
    created: true,
    message: `Schema generated with ${Object.keys(schema.variables).length} variables from ${envPath}`,
    schemaPath,
  };
}
