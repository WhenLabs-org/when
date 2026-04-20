// Schema parsing / loading
export { parseSchemaFile, parseSchemaString } from "./schema/parser.js";
export { loadSchema, mergeSchemas } from "./schema/loader.js";
export { validateValue } from "./schema/validators.js";

// Validation
export { validate } from "./commands/validate.js";
export type { ValidateOptions } from "./commands/validate.js";

// Other commands
export { diffEnvFiles } from "./commands/diff.js";
export { syncCheck, inferEnvironmentName } from "./commands/sync.js";
export { readEnvFile, parseEnvString } from "./env/reader.js";
export { generateExample } from "./commands/generate.js";
export { inferType, generateSchema } from "./commands/init.js";
export { createReporter } from "./reporters/index.js";
export { maskValue } from "./utils/crypto.js";
export { detectEnvUsage, detectEnvVarsInCode } from "./env/detector.js";
export { generateSchemaFromCode } from "./commands/detect-generate.js";
export { scanSecrets } from "./commands/secrets.js";
export { loadConfig, mergeOptions } from "./config.js";
export { createTool, scan as scanTool } from "./tool.js";
export type { EnvalidScanOptions } from "./tool.js";

// Runtime / validator registry
export {
  Registry,
  getDefaultRegistry,
  resetDefaultRegistry,
} from "./runtime/registry.js";
export type {
  ValidatorDefinition,
  ValidatorCtx,
  ValidatorResult as RegistryValidatorResult,
} from "./runtime/registry.js";
export { BUILTIN_TYPES, registerBuiltins } from "./runtime/builtins.js";

// Codegen
export { generateTypedClient } from "./codegen/emitter.js";
export { runCodegen } from "./commands/codegen.js";

// Types
export type {
  EnvSchema,
  VariableSchema,
  GroupSchema,
  SchemaValueType,
  BuiltinValueType,
  ValidationResult,
  ValidationIssue,
  ValidationIssueKind,
  ValidationSeverity,
  DiffResult,
  DiffEntry,
  Reporter,
} from "./schema/types.js";
export type { EnvFile } from "./env/reader.js";
export type { ReporterFormat } from "./reporters/index.js";
export type { DetectionResult, FileLocation } from "./env/detector.js";
export type { GenerateSchemaResult } from "./commands/detect-generate.js";
export type { EnvalidConfig } from "./config.js";
export type { SecretFinding, SecretsResult } from "./commands/secrets.js";
export type { CodegenOptions, CodegenRuntime } from "./codegen/emitter.js";
