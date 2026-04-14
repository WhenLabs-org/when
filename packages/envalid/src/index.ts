// Public API
export { parseSchemaFile, parseSchemaString } from "./schema/parser.js";
export { validateValue } from "./schema/validators.js";
export { validate } from "./commands/validate.js";
export { diffEnvFiles } from "./commands/diff.js";
export { syncCheck, inferEnvironmentName } from "./commands/sync.js";
export { readEnvFile, parseEnvString } from "./env/reader.js";
export { generateExample } from "./commands/generate.js";
export { inferType, generateSchema } from "./commands/init.js";
export { createReporter } from "./reporters/index.js";
export { maskValue } from "./utils/crypto.js";
export { detectEnvUsage } from "./env/detector.js";
export {
  installHook,
  uninstallHook,
  isHookInstalled,
  getGitRoot,
} from "./utils/git.js";
export { loadConfig, mergeOptions } from "./config.js";

// Types
export type {
  EnvSchema,
  VariableSchema,
  GroupSchema,
  SchemaValueType,
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
  DiffResult,
  DiffEntry,
  Reporter,
} from "./schema/types.js";
export type { EnvFile } from "./env/reader.js";
export type { ValidateOptions } from "./commands/validate.js";
export type { ReporterFormat } from "./reporters/index.js";
export type { DetectionResult } from "./env/detector.js";
export type { EnvalidConfig } from "./config.js";
