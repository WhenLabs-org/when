import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import type { EnvSchema } from "../schema/types.js";
import {
  generateTypedClient,
  type CodegenOptions,
} from "../codegen/emitter.js";

export interface RunCodegenOptions extends CodegenOptions {
  schema: EnvSchema;
  outputPath: string;
}

export function runCodegen(options: RunCodegenOptions): string {
  const content = generateTypedClient(options.schema, {
    runtime: options.runtime,
    schemaPath: options.schemaPath,
    registry: options.registry,
  });
  const dir = dirname(options.outputPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(options.outputPath, content, "utf-8");
  return content;
}
