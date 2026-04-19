/**
 * @whenlabs/core — shared types for the @whenlabs developer toolkit.
 *
 * v1.0 surface (stable contract — breaking changes require a 2.0 bump):
 *   - schemaVersion
 *   - ProjectContext
 *   - Finding (+ Severity, Location)
 *   - ScanResult (+ ScanTiming, ScanSummary, ScanOptions, Patch)
 *   - Tool
 *   - SuggestionRule (+ TriggerContext)
 */

export const schemaVersion = 1 as const;

// --- Shared project identity -------------------------------------------------

export interface ProjectContext {
  /** Short, human-friendly identifier (derived from .aware / git / dir name). */
  name: string;
  /** Absolute path to the project root. */
  cwd: string;
  /**
   * Detected stack hints (e.g. "node", "python", "docker"). Deliberately a
   * loose string array — kit uses these for heuristics, not control flow.
   */
  detectedStack: string[];
  /** Absolute path to the tool's config file if one was loaded. */
  configPath?: string;
}

// --- Findings ----------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info';

export interface Location {
  /** Absolute or project-relative file path. */
  file: string;
  line?: number;
  column?: number;
  /** Short code excerpt or claim text, for display. */
  snippet?: string;
}

export interface Finding {
  /** Tool that produced this finding (e.g. "vow", "berth", "stale"). */
  tool: string;
  /** Stable rule identifier within the tool (e.g. "unknown-license"). */
  ruleId: string;
  severity: Severity;
  /** One-line human message. */
  message: string;
  /** Optional longer-form suggestion (imperative: "Add SPDX expression to..."). */
  suggestion?: string;
  /** Where the finding lives in the project (if applicable). */
  location?: Location;
  /**
   * Free-form tool-specific payload. Tools MAY include their native item type
   * here (PackageInfo, Conflict, DriftIssue, etc.) without widening the core.
   */
  data?: unknown;
}

// --- Scan aggregate ----------------------------------------------------------

export interface ScanTiming {
  /** ISO 8601. */
  startedAt: string;
  /** Wall time in ms. */
  durationMs: number;
}

export interface ScanSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  /** Free-form tool-specific rollups (e.g. byLicense, byCategory). */
  extra?: Record<string, unknown>;
}

export interface ScanResult {
  schemaVersion: typeof schemaVersion;
  tool: string;
  /** True iff no error-severity findings. */
  ok: boolean;
  project: ProjectContext;
  findings: Finding[];
  summary: ScanSummary;
  timing: ScanTiming;
  /** Untransformed native result for callers that need tool-specific fields. */
  raw?: unknown;
}

// --- Tool interface ----------------------------------------------------------

export interface ScanOptions {
  /** Project root; defaults to process.cwd(). */
  cwd?: string;
  /** Tool-specific options passthrough. */
  options?: Record<string, unknown>;
}

export interface Patch {
  /** Absolute path of the file to change. */
  file: string;
  /** Full new contents (or a diff — tool's choice, conveyed via `kind`). */
  contents: string;
  kind: 'replace' | 'create' | 'delete';
}

export interface Tool {
  /** Stable tool name, e.g. "vow". */
  name: string;
  /** Human-readable one-liner for UIs. */
  description: string;
  scan(opts?: ScanOptions): Promise<ScanResult>;
  /** Optional: produce a patch that would resolve a finding. */
  fix?(finding: Finding): Promise<Patch | null>;
}

// --- SuggestionRule (mirrors when/src/mcp/run-cli.ts Phase 1 definition) ----

export interface TriggerContext {
  toolName: string;
  output: string;
  path?: string;
}

export interface SuggestionRule {
  /** Short identifier used for debugging/tracing. */
  id: string;
  /** Which tool invocation this rule applies to. */
  tool: string;
  /** Predicate over tool output (and optional side state). */
  match: (ctx: TriggerContext) => boolean | Promise<boolean>;
  /** Produce follow-up text / side-effects. Returns hints to append. */
  emit: (ctx: TriggerContext) => string[] | Promise<string[]>;
}

// --- Forward-compat: schemaVersion v2 translator stub -----------------------

/**
 * Minimal shape the kit uses to detect "this came from a newer core than I
 * understand." Anything stamped with a `schemaVersion` other than {@link schemaVersion}
 * is a candidate for translation. Kept as `unknown`-ish on purpose — by design
 * we don't know the v2 shape yet.
 */
export interface VersionedResult {
  schemaVersion: number;
  [key: string]: unknown;
}

/**
 * Forward-compat seam for when `schemaVersion` is bumped to 2 in a future
 * breaking release. Consumers should call this before narrowing a result to
 * {@link ScanResult} so the kit has a single place to land v2→v1 adapters.
 *
 * **Status (v1.0):** no-op. There is no v2 yet, so the only legal input is a
 * v1 result, which is returned as-is. When v2 lands, this function becomes the
 * canonical place to translate `{schemaVersion: 2, ...}` payloads down to v1
 * for older consumers (or vice versa for newer ones).
 *
 * Throws if handed a schemaVersion the installed core doesn't understand,
 * so the kit fails loud instead of silently mis-parsing.
 */
export function translateScanResult(input: VersionedResult): ScanResult {
  if (input.schemaVersion === schemaVersion) {
    return input as unknown as ScanResult;
  }
  throw new Error(
    `@whenlabs/core: unsupported schemaVersion ${input.schemaVersion} (this build understands ${schemaVersion}). ` +
      `Upgrade @whenlabs/core to consume newer tool output, or downgrade the tool.`,
  );
}
