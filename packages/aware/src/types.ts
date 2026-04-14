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
}

export interface ConventionsConfig {
  naming?: NamingConventions;
  imports?: ImportConventions;
  components?: Record<string, string>;
  api?: Record<string, string>;
  testing?: Record<string, string>;
  [key: string]: Record<string, string> | NamingConventions | ImportConventions | undefined;
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
}

// ---- Fragment / Generation types ----

export interface Fragment {
  id: string;
  category: FragmentCategory;
  title: string;
  content: string;
  priority: number;
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
  | "api";

export type FragmentFunction = (
  stack: DetectedStack,
  config: AwareConfig,
) => Fragment | null;

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
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  workspaces?: string[] | { packages: string[] };
}
