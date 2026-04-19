import { existsSync } from "node:fs";
import { loadSchema } from "../schema/loader.js";
import { validate } from "../commands/validate.js";
import { parseEnvString } from "../env/reader.js";
import type { EnvSchema, VariableSchema } from "../schema/types.js";
import {
  registerBuiltins,
} from "../runtime/builtins.js";
import { getDefaultRegistry, type Registry } from "../runtime/registry.js";
import { EnvalidError } from "../errors.js";

export interface CreateEnvOptions {
  /** Schema path. Defaults to `.env.schema`. */
  schemaPath?: string;
  /** Source of environment variables. Defaults to process.env. */
  source?: Record<string, string | undefined>;
  /** Treat any validation error as fatal. Default true. */
  strict?: boolean;
  environment?: string;
  registry?: Registry;
  /** When true, throws on issues; otherwise returns a sentinel `__issues`. */
  throwOnInvalid?: boolean;
}

export interface TypedEnv {
  [key: string]: string | number | boolean | unknown;
}

let builtinsReady = false;
function ensureBuiltins(): void {
  if (builtinsReady) return;
  registerBuiltins(getDefaultRegistry());
  builtinsReady = true;
}

/**
 * Runtime counterpart of the codegen emitter: validates process.env against
 * the schema and returns a frozen typed object. Meant to be called once at
 * process startup by framework adapters.
 */
export function createEnv(options: CreateEnvOptions = {}): Readonly<TypedEnv> {
  ensureBuiltins();
  const schemaPath = options.schemaPath ?? ".env.schema";
  if (!existsSync(schemaPath)) {
    throw new EnvalidError(
      `Schema file not found: ${schemaPath}`,
      "SCHEMA_NOT_FOUND",
    );
  }
  const schema = loadSchema(schemaPath);
  const source = options.source ?? (process.env as Record<string, string>);
  const filtered: Record<string, string> = {};
  for (const name of Object.keys(schema.variables)) {
    const v = source[name];
    if (typeof v === "string" && v !== "") filtered[name] = v;
  }
  const result = validate(schema, parseEnvString(formatEnv(filtered)), {
    environment: options.environment,
  });
  if (!result.valid && (options.throwOnInvalid ?? true)) {
    const msgs = result.issues
      .filter((i) => i.severity === "error")
      .map((i) => `  - ${i.variable}: ${i.message}`)
      .join("\n");
    throw new EnvalidError(
      `Environment validation failed:\n${msgs}`,
      "ENV_INVALID",
    );
  }
  return freeze(schema, source);
}

function freeze(
  schema: EnvSchema,
  source: Record<string, string | undefined>,
): Readonly<TypedEnv> {
  const out: TypedEnv = {};
  for (const [name, v] of Object.entries(schema.variables)) {
    out[name] = coerce(v, source[name] ?? defaultString(v));
  }
  return Object.freeze(out);
}

function coerce(v: VariableSchema, raw: string | undefined): unknown {
  if (raw === undefined || raw === "") return undefined;
  switch (v.type) {
    case "integer":
    case "float":
      return Number(raw);
    case "boolean":
      return ["true", "1"].includes(raw.toLowerCase());
    case "csv":
      return raw.split(",");
    case "json":
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    default:
      return raw;
  }
}

function defaultString(v: VariableSchema): string | undefined {
  return v.default === undefined ? undefined : String(v.default);
}

function formatEnv(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join("\n");
}
