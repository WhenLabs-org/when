import { writeFileSync } from "node:fs";
import type { EnvSchema } from "../schema/types.js";
import {
  toJsonSchema,
  toOpenApiComponent,
  type JsonSchemaExportOptions,
} from "../export/jsonSchema.js";

export type ExportFormat = "json-schema" | "openapi";

export interface RunExportOptions extends JsonSchemaExportOptions {
  schema: EnvSchema;
  format: ExportFormat;
  outputPath?: string;
  pretty?: boolean;
  openapiVersion?: "3.0" | "3.1";
}

export function runExport(options: RunExportOptions): string {
  const doc =
    options.format === "openapi"
      ? toOpenApiComponent(options.schema, {
          title: options.title,
          version: options.openapiVersion,
        })
      : toJsonSchema(options.schema, { title: options.title });
  const json = options.pretty
    ? JSON.stringify(doc, null, 2)
    : JSON.stringify(doc);
  if (options.outputPath) {
    writeFileSync(options.outputPath, json + "\n", "utf-8");
  }
  return json;
}
