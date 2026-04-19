import type { EnvSchema, ValidationResult } from "../schema/types.js";
import { readEnvFile } from "../env/reader.js";
import { validate, type ValidateOptions } from "./validate.js";

export function inferEnvironmentName(filePath: string): string | undefined {
  // .env.production -> production
  // .env.staging -> staging
  // .env -> undefined
  const match = filePath.match(/\.env\.(.+)$/);
  return match ? match[1] : undefined;
}

export function syncCheck(
  schema: EnvSchema,
  envPaths: string[],
  options?: Pick<ValidateOptions, "ci">,
): Map<string, ValidationResult> {
  const results = new Map<string, ValidationResult>();

  for (const envPath of envPaths) {
    const envFile = readEnvFile(envPath);
    const environment = inferEnvironmentName(envPath);
    const result = validate(schema, envFile, {
      environment,
      ci: options?.ci,
    });
    results.set(envPath, result);
  }

  return results;
}
