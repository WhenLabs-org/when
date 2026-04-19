import type { EnvSchema, VariableSchema } from "../schema/types.js";
import { getDefaultRegistry, type Registry } from "../runtime/registry.js";
import { registerBuiltins } from "../runtime/builtins.js";

export interface JsonSchemaExportOptions {
  registry?: Registry;
  title?: string;
}

let ensured = false;
function ensureBuiltins(): void {
  if (ensured) return;
  registerBuiltins(getDefaultRegistry());
  ensured = true;
}

export function toJsonSchema(
  schema: EnvSchema,
  options: JsonSchemaExportOptions = {},
): Record<string, unknown> {
  ensureBuiltins();
  const registry = options.registry ?? getDefaultRegistry();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, variable] of Object.entries(schema.variables)) {
    properties[name] = propertyFragment(variable, registry);
    if (variable.required && variable.default === undefined) {
      required.push(name);
    }
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: options.title ?? "Env",
    type: "object",
    properties,
    required: required.sort(),
    additionalProperties: true,
  };
}

export function toOpenApiComponent(
  schema: EnvSchema,
  options: JsonSchemaExportOptions & { version?: "3.0" | "3.1" } = {},
): Record<string, unknown> {
  const base = toJsonSchema(schema, options);
  const doc = {
    openapi: options.version ?? "3.1.0",
    info: { title: options.title ?? "Env", version: "1.0.0" },
    components: {
      schemas: {
        Env: stripRootKeys(base),
      },
    },
  };
  return doc;
}

function stripRootKeys(
  schemaDoc: Record<string, unknown>,
): Record<string, unknown> {
  const { $schema: _s, ...rest } = schemaDoc as { $schema?: unknown } & Record<
    string,
    unknown
  >;
  return rest;
}

function propertyFragment(
  variable: VariableSchema,
  registry: Registry,
): Record<string, unknown> {
  const def = registry.getValidator(variable.type);
  const base: Record<string, unknown> = def?.toJsonSchema
    ? def.toJsonSchema(variable)
    : { type: "string" };
  if (variable.description) base.description = variable.description;
  if (variable.default !== undefined) base.default = variable.default;
  if (variable.sensitive) base["x-envalid-sensitive"] = true;
  if (variable.environments) base["x-envalid-environments"] = variable.environments;
  return base;
}
