import type { StackConfig, TargetName } from "../types.js";

/**
 * Unified drift representation consumed by the CLI, CI (`--check` exit
 * codes), `doctor`, and the future TUI. One type, three severity buckets.
 *
 * - `none`:   nothing to report.
 * - `warn`:   stack drift or generated-file staleness — user needs to sync.
 *             Caused by normal project evolution (upgraded a dep, added a
 *             testing library) and is not a sign of anything wrong.
 * - `tamper`: a generated file was edited outside `aware sync`. Higher
 *             severity because the in-file change will be lost on next sync
 *             unless the user acts.
 *
 * Phase 1 `aware diff --check` maps severities to exit codes:
 *     none   -> 0
 *     warn   -> 1
 *     tamper -> 2
 */
export type DriftSeverity = "none" | "warn" | "tamper";

export interface StackDrift {
  key: keyof StackConfig;
  label: string;
  previous: string | null;
  current: string | null;
  kind: "added" | "removed" | "changed";
}

export type ContentDriftKind =
  | "missing"
  | "outdated"
  | "tampered"
  | "unmanaged"
  /**
   * Target is disabled in config but its generated file is still on disk.
   * Surfaced so `doctor` and `diff --check` agree on what should/shouldn't
   * exist.
   */
  | "stale";

export interface ContentDrift {
  target: TargetName;
  filePath: string;
  /** "" for root / single-package projects; a workspace path in Phase 4. */
  packagePath: string;
  kind: ContentDriftKind;
  /**
   * Optional per-section attribution when drift is "outdated". The drift
   * engine degrades gracefully: if section markers are absent or malformed,
   * this stays empty and the file-level verdict still stands.
   */
  sections?: SectionDrift[];
  /** Human-readable explanation rendered in the default CLI output. */
  message: string;
}

export interface SectionDrift {
  id: string;
  kind: "added" | "removed" | "changed";
}

export interface DriftReport {
  stackDrifts: StackDrift[];
  contentDrifts: ContentDrift[];
  severity: DriftSeverity;
  /** Convenience flags mirroring the severity breakdown. */
  hasStackDrift: boolean;
  hasContentDrift: boolean;
  hasTamper: boolean;
}
