// Schema parsing / loading
export { parseSchemaFile, parseSchemaString } from "./schema/parser.js";
export { loadSchema, mergeSchemas } from "./schema/loader.js";
export { validateValue } from "./schema/validators.js";

// Validation
export { validate, validateAsync } from "./commands/validate.js";
export type {
  ValidateOptions,
  ValidateAsyncOptions,
} from "./commands/validate.js";

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
export {
  installHook,
  uninstallHook,
  isHookInstalled,
  getGitRoot,
} from "./utils/git.js";
export { loadConfig, mergeOptions } from "./config.js";
export { createTool, scan as scanTool } from "./tool.js";
export type { EnvalidScanOptions } from "./tool.js";

// Runtime / plugin API
export {
  Registry,
  getDefaultRegistry,
  resetDefaultRegistry,
  definePlugin,
} from "./runtime/registry.js";
export type {
  EnvalidPlugin,
  ValidatorDefinition,
  ValidatorCtx,
  ValidatorResult as RegistryValidatorResult,
  SecretProvider,
} from "./runtime/registry.js";
export { BUILTIN_TYPES, registerBuiltins } from "./runtime/builtins.js";
export { resolvePlugin, loadPlugins } from "./runtime/plugin.js";

// Secret providers
export {
  resolveSecrets,
  parseSecretRef,
  createMemoryCache,
  defineProvider,
} from "./providers/index.js";
export { vaultProvider } from "./providers/vault.js";
export { awsSmProvider } from "./providers/awsSm.js";
export { dopplerProvider } from "./providers/doppler.js";
export { onepasswordProvider } from "./providers/onepassword.js";

// Codegen / export / fix / migrate / watch
export { generateTypedClient } from "./codegen/emitter.js";
export { runCodegen } from "./commands/codegen.js";
export { toJsonSchema, toOpenApiComponent } from "./export/jsonSchema.js";
export { runExport } from "./commands/export.js";
export { applyFixes, runFix } from "./commands/fix.js";
export { runWatch } from "./commands/watch.js";
export { startWatching } from "./runtime/watcher.js";
export { runMigrate } from "./commands/migrate.js";
export {
  applyMigration,
  applyToEnv,
  applyToCode,
  applyToSchema,
  invertMigration,
} from "./migrate/apply.js";
export { parseMigrationFile } from "./migrate/parser.js";

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
export type { ExportFormat, RunExportOptions } from "./commands/export.js";
export type { FixOptions, FixResult } from "./commands/fix.js";
export type { WatchOptions } from "./commands/watch.js";
export type { RunMigrateOptions } from "./commands/migrate.js";
export type { MigrationFile, MigrationOp } from "./migrate/types.js";
