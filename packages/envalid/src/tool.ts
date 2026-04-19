import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import type {
  Finding,
  ProjectContext,
  ScanOptions,
  ScanResult,
  Severity,
  Tool,
} from "@whenlabs/core";
import { schemaVersion } from "@whenlabs/core";
import { parseSchemaFile } from "./schema/parser.js";
import { readEnvFile } from "./env/reader.js";
import { validate } from "./commands/validate.js";
import type { ValidationIssue, ValidationSeverity } from "./schema/types.js";

const TOOL_NAME = "envalid";
const TOOL_DESCRIPTION = "Type safety for .env files";

const SCHEMA_CANDIDATES = [
  ".env.schema",
  ".env.schema.yaml",
  ".env.schema.yml",
  "env.schema.yaml",
  "env.schema.yml",
];
const ENV_CANDIDATES = [".env", ".env.local"];

export interface EnvalidScanOptions {
  schema?: string;
  env?: string;
  environment?: string;
  ci?: boolean;
}

function toSeverity(severity: ValidationSeverity): Severity {
  return severity === "warning" ? "warning" : severity;
}

function ruleIdFor(issue: ValidationIssue): string {
  if (issue.message.startsWith("Missing required")) return "missing-required";
  if (issue.message.startsWith("Required in")) return "missing-in-environment";
  if (issue.message.startsWith("Variable exists in .env but not in schema")) {
    return "undocumented-variable";
  }
  return "invalid-value";
}

function resolveCandidate(cwd: string, candidates: string[]): string | undefined {
  for (const name of candidates) {
    const full = resolve(cwd, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

function resolvePath(cwd: string, input: string): string {
  return isAbsolute(input) ? input : resolve(cwd, input);
}

export async function scan(opts: ScanOptions = {}): Promise<ScanResult> {
  const startedAt = new Date();
  const hr = process.hrtime.bigint();
  const cwd = opts.cwd ?? process.cwd();
  const toolOpts = (opts.options ?? {}) as EnvalidScanOptions;

  const project: ProjectContext = {
    name: basename(cwd),
    cwd,
    detectedStack: [],
  };

  const findings: Finding[] = [];
  const schemaPath = toolOpts.schema
    ? resolvePath(cwd, toolOpts.schema)
    : resolveCandidate(cwd, SCHEMA_CANDIDATES);
  const envPath = toolOpts.env
    ? resolvePath(cwd, toolOpts.env)
    : resolveCandidate(cwd, ENV_CANDIDATES);

  let rawResult: unknown;

  if (!schemaPath) {
    findings.push({
      tool: TOOL_NAME,
      ruleId: "schema-not-found",
      severity: "error",
      message: "No env schema file found",
      suggestion: `Create an ${SCHEMA_CANDIDATES[0]} file or pass options.schema`,
    });
  } else if (!envPath) {
    findings.push({
      tool: TOOL_NAME,
      ruleId: "env-not-found",
      severity: "error",
      message: "No .env file found",
      suggestion: `Create a .env file or pass options.env`,
      location: { file: schemaPath },
    });
  } else {
    const schema = parseSchemaFile(schemaPath);
    const envFile = readEnvFile(envPath);
    const result = validate(schema, envFile, {
      environment: toolOpts.environment,
      ci: toolOpts.ci,
    });
    rawResult = result;

    for (const issue of result.issues) {
      findings.push({
        tool: TOOL_NAME,
        ruleId: ruleIdFor(issue),
        severity: toSeverity(issue.severity),
        message: `${issue.variable}: ${issue.message}`,
        suggestion: issue.suggestion,
        location: { file: envPath },
        data: {
          variable: issue.variable,
          expected: issue.expected,
          actual: issue.actual,
        },
      });
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const infos = findings.filter((f) => f.severity === "info").length;
  const durationMs = Number((process.hrtime.bigint() - hr) / 1_000_000n);

  return {
    schemaVersion,
    tool: TOOL_NAME,
    ok: errors === 0,
    project,
    findings,
    summary: {
      total: findings.length,
      errors,
      warnings,
      infos,
    },
    timing: {
      startedAt: startedAt.toISOString(),
      durationMs,
    },
    raw: rawResult,
  };
}

export function createTool(): Tool {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    scan,
  };
}
