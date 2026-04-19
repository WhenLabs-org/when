import type { EnvSchema, DiffEntry, DiffResult } from "../schema/types.js";
import type { EnvFile } from "../env/reader.js";
import { maskValue } from "../utils/crypto.js";

export function diffEnvFiles(
  source: EnvFile,
  target: EnvFile,
  schema?: EnvSchema,
): DiffResult {
  const allKeys = new Set([
    ...Object.keys(source.variables),
    ...Object.keys(target.variables),
  ]);

  const entries: DiffEntry[] = [];

  for (const key of allKeys) {
    const inSource = key in source.variables;
    const inTarget = key in target.variables;
    const varSchema = schema?.variables[key];
    const isSensitive = varSchema?.sensitive ?? false;

    if (inSource && !inTarget) {
      entries.push({
        variable: key,
        status: "removed",
        sourceValue: isSensitive
          ? maskValue(source.variables[key])
          : source.variables[key],
        inSchema: !!varSchema,
        required: varSchema?.required ?? false,
      });
    } else if (!inSource && inTarget) {
      entries.push({
        variable: key,
        status: "added",
        targetValue: isSensitive
          ? maskValue(target.variables[key])
          : target.variables[key],
        inSchema: !!varSchema,
        required: varSchema?.required ?? false,
      });
    } else if (source.variables[key] !== target.variables[key]) {
      entries.push({
        variable: key,
        status: "changed",
        sourceValue: isSensitive
          ? maskValue(source.variables[key])
          : source.variables[key],
        targetValue: isSensitive
          ? maskValue(target.variables[key])
          : target.variables[key],
        inSchema: !!varSchema,
        required: varSchema?.required ?? false,
      });
    }
  }

  return { source: source.path, target: target.path, entries };
}
