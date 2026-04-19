// ---- Detection types ----

export interface StackItem {
  name: string;
  version: string | null;
  variant: string | null;
  confidence: number;
  detectedFrom: string;
}

export interface DetectedStack {
  framework: StackItem | null;
  language: StackItem | null;
  styling: StackItem | null;
  orm: StackItem | null;
  database: StackItem | null;
  testing: StackItem[];
  linting: StackItem[];
  packageManager: StackItem | null;
  monorepo: StackItem | null;
  deployment: StackItem | null;
  auth: StackItem | null;
  apiStyle: StackItem | null;
  stateManagement: StackItem | null;
  cicd: StackItem | null;
  bundler: StackItem | null;
}

// ---- Config types (.aware.json) ----

export interface AwareConfig {
  version: number;
  project: ProjectMeta;
  stack: StackConfig;
  conventions: ConventionsConfig;
  rules: string[];
  structure: Record<string, string>;
  targets: TargetsConfig;
  _meta: ConfigMeta;
  /** Optional path to another .aware.json whose fields this config inherits (monorepo use). */
  extends?: string;
  /** Optional workspace member globs for monorepo roots. */
  packages?: string[];
  /**
   * Plugin specifiers to load before fragment resolution. Each entry is
   * either an npm package name (`aware-plugin-acme`) or a path relative
   * to the project root (`./local-plugin.js`). Plugins register
   * fragments with the shared registry — duplicate-id rules apply.
   */
  plugins?: string[];
  /**
   * Fragment-level user overrides. Currently supports `disabled: [...]`
   * — fragment ids the user wants suppressed from generated output.
   * Phase 6 `aware fragments disable <id>` writes to this list; the
   * registry filters matching fragments out at resolve time.
   */
  fragments?: FragmentsOverrides;
}

export interface FragmentsOverrides {
  /** Fragment ids to suppress from the generated output. */
  disabled?: string[];
}

export interface ProjectMeta {
  name: string;
  description: string;
  architecture: string;
}

export interface StackConfig {
  framework: string | null;
  language: string | null;
  styling: string | null;
  orm: string | null;
  database: string | null;
  testing: string[];
  linting: string[];
  packageManager: string | null;
  monorepo: string | null;
  deployment: string | null;
  auth: string | null;
  apiStyle: string | null;
  stateManagement: string | null;
  cicd: string | null;
  bundler: string | null;
}

export interface ConventionsConfig {
  naming?: NamingConventions;
  imports?: ImportConventions;
  components?: Record<string, string>;
  api?: Record<string, string>;
  testing?: Record<string, string>;
  /**
   * Conventions auto-extracted from scanning project source code.
   * Never overwrites user-authored values in sibling fields (naming,
   * imports, ...). Phase 3 populates this on every `sync`; consumers
   * that want to surface extracted values to the user must read it
   * explicitly.
   */
  extracted?: ExtractedConventions;
  /**
   * Opt out of source-code scanning for convention extraction by
   * setting to `false`. Useful for monorepos with unusual layouts,
   * or for users who don't want their code sampled. Default: true.
   */
  extract?: boolean;
  [key: string]:
    | Record<string, string>
    | NamingConventions
    | ImportConventions
    | ExtractedConventions
    | boolean
    | undefined;
}

export interface ExtractedConventions {
  naming?: NamingConventions;
  imports?: ImportConventions;
  tests?: Record<string, string>;
  layout?: Record<string, string>;
  _confidence?: Record<string, number>;
  _sampleSize?: number;
}

export interface NamingConventions {
  files?: string;
  components?: string;
  functions?: string;
  constants?: string;
  database?: string;
}

export interface ImportConventions {
  style?: string;
  order?: string[];
  alias?: string;
}

export interface TargetsConfig {
  claude: boolean;
  cursor: boolean;
  copilot: boolean;
  agents: boolean;
}

export interface ConfigMeta {
  createdAt: string;
  lastSyncedAt: string | null;
  lastDetectionHash: string;
  awareVersion: string;
  /**
   * Per-file content hashes as of the last `sync`, used by Phase 1 to
   * detect hand-edits. Shape:
   *   { [packagePath]: { [target]: hash } }
   * The outer key is a package path relative to the repo root; the empty
   * string `""` is the root / single-package case. Phase 4 populates
   * per-package keys when the project is a monorepo.
   */
  fileHashes?: Record<string, Partial<Record<TargetName, string>>>;
  /**
   * Provenance map: which fragment@version produced each target's output
   * at the last sync. Same outer-key convention as `fileHashes`.
   */
  fragmentVersions?: Record<
    string,
    Partial<Record<TargetName, Record<string, string>>>
  >;
}

// ---- Fragment / Generation types ----

export interface Fragment {
  id: string;
  category: FragmentCategory;
  title: string;
  content: string;
  priority: number;
  /**
   * Fragment version, populated from the owning `FragmentModule.version`
   * at resolve time. Used by Phase 1 drift detection to answer
   * "which fragment@version produced this output?".
   */
  version?: string;
}

export type FragmentCategory =
  | "framework"
  | "language"
  | "styling"
  | "orm"
  | "database"
  | "testing"
  | "linting"
  | "deployment"
  | "auth"
  | "api"
  | "state-management"
  | "cicd";

/**
 * Contract: implementations MUST treat `stack` and `config` as
 * read-only. They're shared across every fragment's build call in a
 * single resolve; a mutation in one fragment would corrupt every
 * subsequent fragment's view. The resolver does not defensively freeze
 * (callers downstream legitimately mutate config further), so this is
 * an honor-system contract enforced by review and by the observable
 * chaos of anyone who violates it.
 */
export type FragmentFunction = (
  stack: DetectedStack,
  config: AwareConfig,
) => Fragment | null;

/**
 * Declarative fragment manifest. Phase 0 introduces this alongside the legacy
 * `FragmentFunction` shape; the registry accepts either form. Later phases
 * migrate fragments to full manifests (version-range resolution, plugin
 * replacement, etc.).
 */
export interface FragmentModule {
  /** Stable identifier used for deduplication, `replaces`, and telemetry. */
  id: string;
  category: FragmentCategory;
  /** Lower = earlier in the rendered output. */
  priority: number;
  /**
   * Stack predicate gating whether the module's `build` runs at all.
   * The gate is category-scoped: a `framework` fragment with
   * `stack: "next"` only matches `stack.framework`, not every category
   * with a `next`-named item.
   *
   * - `stack`: single name or list (Prisma applies across many frameworks).
   * - `variant`: narrows by the detected StackItem.variant
   *   (e.g. `"app-router"` vs `"pages-router"` for Next.js).
   * - `versionRange`: major-only semver range. Supported syntax:
   *     `"*"`, `"15"`, `"^15"` / `"~15"` (both treated as exact major),
   *     `">=14"`, `"<16"`, `">=14 <16"`, `"14 || 15"`. Unsupported
   *     operators throw at match time so authors notice.
   * - `matchUnknown`: when true, a null stack-item version still matches
   *   (useful as a "default when we can't determine the version"
   *   fallback — set on the newest fragment in a version-split set).
   */
  appliesTo?: {
    stack?: string | string[];
    variant?: string | string[];
    versionRange?: string;
    matchUnknown?: boolean;
  };
  /** Core build function — returns a Fragment or null when not applicable. */
  build: FragmentFunction;
  /** IDs of other fragments this module overrides (plugin override mechanism). */
  replaces?: string[];
  /**
   * Fragment content version — a tag for this fragment's *guidance*,
   * not the detected stack's version. Threaded onto `Fragment.version`
   * at resolve time so Phase 1 drift detection can record "this output
   * was produced by nextjs-15@15.x". Distinct from StackItem.version,
   * which is the version of the detected package in the user's project.
   */
  version?: string;
}

export interface ComposedContext {
  projectSection: string;
  stackSection: string;
  fragmentSections: Fragment[];
  conventionsSection: string;
  rulesSection: string;
  structureSection: string;
}

export type TargetName = "claude" | "cursor" | "copilot" | "agents";

export interface GeneratorResult {
  target: TargetName;
  filePath: string;
  content: string;
  sections: number;
}

// ---- Diff types ----

export interface ProjectDiff {
  addedDeps: string[];
  removedDeps: string[];
  changedFiles: string[];
  stackChanges: StackChange[];
  suggestedUpdates: string[];
}

export interface StackChange {
  category: keyof DetectedStack;
  previous: string | null;
  current: string | null;
  description: string;
}

// ---- Detector interface ----

export interface Detector {
  name: string;
  detect(projectRoot: string): Promise<StackItem | StackItem[] | null>;
}

// ---- Parser types ----

export interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  workspaces?: string[] | { packages: string[] };
}
