import { z } from "zod";
import YAML from "yaml";
import { readFileSync, existsSync } from "node:fs";
import type { EnvSchema } from "./types.js";
import { SchemaNotFoundError, SchemaParseError } from "../errors.js";

const variableSchemaZod = z
  .object({
    type: z.enum([
      "string",
      "integer",
      "float",
      "boolean",
      "url",
      "email",
      "enum",
      "csv",
      "json",
      "path",
      "semver",
    ]),
    required: z.boolean().default(true),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string().optional(),
    sensitive: z.boolean().optional(),
    environments: z.array(z.string()).optional(),
    pattern: z.string().optional(),
    range: z.tuple([z.number(), z.number()]).optional(),
    values: z.array(z.string()).optional(),
    protocol: z.array(z.string()).optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
  })
  .refine((v) => v.type !== "enum" || (v.values && v.values.length > 0), {
    message: "Enum type requires a non-empty 'values' array",
  })
  .refine(
    (v) =>
      !["integer", "float"].includes(v.type) ||
      !v.range ||
      v.range[0] <= v.range[1],
    { message: "Range min must be <= max" },
  );

const groupSchemaZod = z.object({
  variables: z.array(z.string()),
  description: z.string().optional(),
  required_in: z.array(z.string()).optional(),
});

const envSchemaZod = z.object({
  version: z.number(),
  variables: z.record(z.string(), variableSchemaZod),
  groups: z.record(z.string(), groupSchemaZod).optional(),
});

export function parseSchemaFile(filePath: string): EnvSchema {
  if (!existsSync(filePath)) {
    throw new SchemaNotFoundError(filePath);
  }
  const content = readFileSync(filePath, "utf-8");
  return parseSchemaString(content);
}

export function parseSchemaString(content: string): EnvSchema {
  let raw: unknown;
  try {
    raw = YAML.parse(content);
  } catch (err) {
    throw new SchemaParseError(
      `Failed to parse YAML: ${(err as Error).message}`,
    );
  }

  const result = envSchemaZod.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new SchemaParseError(messages);
  }

  return result.data as EnvSchema;
}
