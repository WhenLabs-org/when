import { writeFileSync } from "node:fs";
import type { EnvSchema, VariableSchema, SchemaValueType } from "../schema/types.js";
import type { FileLocation } from "../env/detector.js";
import { schemaToYaml } from "./init.js";

const SENSITIVE_PATTERN = /secret|key|token|password|api_key|private|credential/i;
const PORT_PATTERN = /port/i;
const URL_PATTERN = /url|uri|endpoint|host|href|origin/i;
const EMAIL_PATTERN = /email|mail/i;
const PATH_PATTERN = /path|dir|directory|folder|file/i;
const BOOL_PATTERN = /enabled?|disabled?|debug|verbose|allow|force|is_|has_|use_|should_|flag/i;

// Ambient/process-provided env vars that should NOT be put in .env.schema.
// These come from the OS, shell, CI runner, devcontainer, or editor — not the app.
export const AMBIENT_ENV_VARS = new Set<string>([
  // POSIX shell
  "HOME", "USER", "LOGNAME", "SHELL", "PATH", "PWD", "OLDPWD", "LANG", "LC_ALL",
  "TERM", "TERM_PROGRAM", "TMPDIR", "DISPLAY", "HOSTNAME",
  // SSH
  "SSH_CONNECTION", "SSH_TTY", "SSH_CLIENT", "SSH_AUTH_SOCK",
  // Windows
  "USERPROFILE", "USERNAME", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH",
  "COMSPEC", "PATHEXT", "SYSTEMROOT", "WINDIR", "LNAME", "OSTYPE",
  // Editor/IDE context
  "CODESPACES", "DEVCONTAINER", "REMOTE_CONTAINERS", "WSL_DISTRO_NAME",
  "VSCODE_INSPECTOR_OPTIONS",
  // Node/runtime
  "NODE_OPTIONS", "NODE_DEBUG", "NODE_V8_COVERAGE", "NODE_INSPECTOR_IPC",
  // XDG
  "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME",
  // CI
  "CI", "GITHUB_ACTIONS", "GITHUB_WORKFLOW", "GITHUB_ACTION", "GITHUB_RUN_ID",
  "GITHUB_RUN_NUMBER", "GITHUB_RUN_ATTEMPT", "GITHUB_API_URL", "GITHUB_SERVER_URL",
  "GITHUB_GRAPHQL_URL", "GITHUB_ENV", "GITHUB_PATH", "GITHUB_OUTPUT",
  "GITHUB_STATE", "GITHUB_STEP_SUMMARY", "GITHUB_EVENT_PATH", "GITHUB_WORKSPACE",
  "GITHUB_REPOSITORY", "GITHUB_REF", "RUNNER_DEBUG",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_URL",
  "ACTIONS_ORCHESTRATION_ID",
  // Test/tool frameworks (when present as process env, not app config)
  "VITEST", "VITEST_WORKER_ID", "VITEST_POOL_ID", "VITEST_MODE",
  "JEST_WORKER_ID", "UPDATE_SNAPSHOT",
  // Color/tty hints
  "NO_COLOR", "FORCE_COLOR", "CLICOLOR_FORCE", "NODE_DISABLE_COLORS",
]);

/**
 * Infer type and required-ness from variable name and code usage context.
 */
function inferFromContext(
  varName: string,
  locations: FileLocation[],
): Partial<VariableSchema> & { type: SchemaValueType } {
  let type: SchemaValueType = "string";
  let required = true;
  let description = "";
  let range: [number, number] | undefined;

  // Analyze all usage contexts
  for (const loc of locations) {
    const ctx = loc.context ?? "";

    // Detect fallbacks / defaults (means optional)
    // process.env.VAR || "default"
    // process.env.VAR ?? "default"
    // os.environ.get("VAR", "default")
    // os.getenv("VAR") or "default"
    if (
      /\|\||(?<!\?)\?\?/.test(ctx) ||
      /\.get\(["'][^"']+["'],\s*["']/.test(ctx) ||
      /\.get\(["'][^"']+["'],\s*\d/.test(ctx)
    ) {
      required = false;
    }

    // parseInt / Number() -> integer
    if (/parseInt\(|Number\(|~~|>>>|<<|\| 0|parseInt\s*\(/.test(ctx)) {
      type = "integer";
    }

    // parseFloat -> float
    if (/parseFloat\(/.test(ctx)) {
      type = "float";
    }

    // Boolean conversion or comparison to true/false
    if (/=== ?['"]true['"]|=== ?['"]false['"]|Boolean\(|!!/.test(ctx)) {
      type = "boolean";
    }

    // new URL() usage
    if (/new URL\(/.test(ctx)) {
      type = "url";
    }

    // JSON.parse usage
    if (/JSON\.parse\(/.test(ctx)) {
      type = "json";
    }

    // .split(",") or .split(", ") -> csv
    if (/\.split\(\s*["'][,;]/.test(ctx)) {
      type = "csv";
    }
  }

  // If code context didn't determine type, infer from variable name
  if (type === "string") {
    if (PORT_PATTERN.test(varName)) {
      type = "integer";
      range = [1, 65535];
    } else if (URL_PATTERN.test(varName)) {
      type = "url";
    } else if (EMAIL_PATTERN.test(varName)) {
      type = "email";
    } else if (PATH_PATTERN.test(varName)) {
      type = "path";
    } else if (BOOL_PATTERN.test(varName)) {
      type = "boolean";
    }
  }

  // Generate a human-readable description from the variable name
  description = generateDescription(varName);

  const result: Partial<VariableSchema> & { type: SchemaValueType } = {
    type,
    required,
    description,
  };

  if (range) {
    result.range = range;
  }

  if (SENSITIVE_PATTERN.test(varName)) {
    result.sensitive = true;
  }

  return result;
}

/**
 * Generate a human-readable description from a variable name.
 * e.g. DATABASE_URL -> "Database url", REDIS_PORT -> "Redis port"
 */
function generateDescription(varName: string): string {
  return varName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export interface GenerateSchemaResult {
  schema: EnvSchema;
  schemaPath: string;
  variableCount: number;
}

/**
 * Generate a .env.schema from detected env var usage in code.
 */
export function generateSchemaFromCode(
  envVarLocations: Record<string, FileLocation[]>,
  schemaPath: string,
): GenerateSchemaResult {
  const variables: Record<string, VariableSchema> = {};

  // Collapse case-duplicates (foo + FOO → FOO) — app env vars are conventionally
  // uppercase, so lowercase variants are almost always local shadow references.
  const upperByLower = new Map<string, string>();
  for (const name of Object.keys(envVarLocations)) {
    const upper = name.toUpperCase();
    if (name === upper) continue;
    if (envVarLocations[upper]) {
      upperByLower.set(name, upper);
    }
  }

  for (const [varName, locations] of Object.entries(envVarLocations)) {
    // Skip ambient/process-provided vars — they belong in the runtime env, not .env
    if (AMBIENT_ENV_VARS.has(varName)) continue;
    // Skip case-duplicate shadows (we already have the uppercase version)
    if (upperByLower.has(varName)) continue;

    const inferred = inferFromContext(varName, locations);
    variables[varName] = {
      type: inferred.type,
      required: inferred.required ?? true,
      ...(inferred.description ? { description: inferred.description } : {}),
      ...(inferred.sensitive ? { sensitive: true } : {}),
      ...(inferred.range ? { range: inferred.range } : {}),
    } as VariableSchema;
  }

  // Sort variables alphabetically for consistent output
  const sortedVariables: Record<string, VariableSchema> = {};
  for (const key of Object.keys(variables).sort()) {
    sortedVariables[key] = variables[key];
  }

  const schema: EnvSchema = {
    version: 1,
    variables: sortedVariables,
  };

  const yamlContent = schemaToYaml(schema);
  writeFileSync(schemaPath, yamlContent, "utf-8");

  return {
    schema,
    schemaPath,
    variableCount: Object.keys(variables).length,
  };
}
