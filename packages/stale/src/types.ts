// --- Severity & Category ---

export type Severity = 'error' | 'warning' | 'info';

export type DriftCategory =
  | 'command'
  | 'file-path'
  | 'env-var'
  | 'url'
  | 'version'
  | 'dependency'
  | 'api-route'
  | 'git-staleness'
  | 'comment-staleness';

// --- Core Issue ---

export interface DocumentLocation {
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  text: string;
}

export interface CodeLocation {
  file: string;
  line: number;
  snippet?: string;
}

export interface DriftEvidence {
  expected?: string;
  actual?: string;
  similarMatches?: string[];
  codeLocations?: CodeLocation[];
}

export interface GitInfo {
  lastModified?: Date;
  lastModifiedBy?: string;
  commitHash?: string;
  removedInCommit?: string;
}

export interface DriftIssue {
  id: string;
  category: DriftCategory;
  severity: Severity;
  source: DocumentLocation;
  message: string;
  suggestion?: string;
  evidence?: DriftEvidence;
  gitInfo?: GitInfo;
}

// --- Scan Report ---

export interface DriftSummary {
  totalChecks: number;
  errors: number;
  warnings: number;
  infos: number;
  passed: number;
  byCategory: Record<DriftCategory, { errors: number; warnings: number; passed: number }>;
}

export interface DriftReport {
  projectPath: string;
  scannedAt: Date;
  duration: number;
  docsScanned: string[];
  config: StaleConfig;
  issues: DriftIssue[];
  summary: DriftSummary;
}

// --- Parsed Document Data ---

export interface ParsedCommand {
  raw: string;
  manager: 'npm' | 'yarn' | 'pnpm' | 'npx' | 'make' | 'other';
  scriptName?: string;
  line: number;
}

export interface CodeBlock {
  language: string | null;
  value: string;
  line: number;
  commands: ParsedCommand[];
}

export interface InlineCode {
  value: string;
  line: number;
}

export interface DocLink {
  url: string;
  text: string;
  line: number;
  isBadge: boolean;
}

export interface DocFilePath {
  path: string;
  line: number;
  context: string;
}

export interface DocEnvVar {
  name: string;
  line: number;
  context: string;
}

export interface VersionClaim {
  runtime: string;
  version: string;
  line: number;
  rawText: string;
}

export interface DependencyClaim {
  name: string;
  line: number;
  context: string;
}

export interface DocApiEndpoint {
  method: string;
  path: string;
  line: number;
  documentedResponse?: string;
}

export interface DocPortClaim {
  port: number;
  line: number;
  context: string;
}

export interface DocSection {
  heading: string;
  depth: number;
  content: string;
  line: number;
  endLine: number;
}

export interface ParsedDocument {
  filePath: string;
  codeBlocks: CodeBlock[];
  inlineCode: InlineCode[];
  links: DocLink[];
  filePaths: DocFilePath[];
  envVars: DocEnvVar[];
  versionClaims: VersionClaim[];
  dependencyClaims: DependencyClaim[];
  apiEndpoints: DocApiEndpoint[];
  portClaims: DocPortClaim[];
  sections: DocSection[];
}

// --- Codebase Facts ---

export interface PackageJsonFacts {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines?: Record<string, string>;
}

export interface CodeEnvVar {
  name: string;
  file: string;
  line: number;
}

export interface CodeRoute {
  method: string;
  path: string;
  file: string;
  line: number;
  framework: 'express' | 'fastify' | 'koa' | 'hono' | 'flask' | 'unknown';
}

export interface DockerComposeFacts {
  services: string[];
}

export interface VersionFacts {
  fromEngines?: string;
  fromNvmrc?: string;
  fromNodeVersion?: string;
  fromDockerfile?: string;
}

export interface ConfigPort {
  port: number;
  source: string;
}

export interface WorkspaceFact {
  name: string;
  relativePath: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines?: Record<string, string>;
}

export interface CodebaseFacts {
  packageJson?: PackageJsonFacts;
  scripts: Record<string, string>;
  makeTargets: string[];
  envVarsUsed: CodeEnvVar[];
  routes: CodeRoute[];
  existingFiles: Set<string>;
  dockerCompose?: DockerComposeFacts;
  nodeVersion?: VersionFacts;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  configPorts: ConfigPort[];
  sourceSymbols: Set<string>;
  workspaces: WorkspaceFact[];
}

// --- Analyzer Interface ---

export interface AnalyzerContext {
  docs: ParsedDocument[];
  codebase: CodebaseFacts;
  config: StaleConfig;
  projectPath: string;
}

export interface Analyzer {
  name: string;
  category: DriftCategory;
  analyze(ctx: AnalyzerContext): Promise<DriftIssue[]>;
}

// --- Reporter Interface ---

export interface Reporter {
  format: 'terminal' | 'json' | 'markdown';
  render(report: DriftReport): string;
}

// --- Config ---

export interface StaleConfig {
  docs: string[];
  ignore: string[];
  checks: {
    commands: boolean;
    filePaths: boolean;
    envVars: boolean;
    urls: boolean | { checkExternal: boolean };
    versions: boolean;
    dependencies: boolean;
    apiRoutes: boolean;
    gitStaleness: boolean | { thresholdDays: number };
    commentStaleness: boolean;
  };
  severity: {
    missingFile: Severity;
    deadCommand: Severity;
    undocumentedEnvVar: Severity;
    staleEnvVar: Severity;
    brokenUrl: Severity;
    versionMismatch: Severity;
    missingDependency: Severity;
    routeMismatch: Severity;
    portMismatch: Severity;
    staleDoc: Severity;
    staleComment: Severity;
  };
  output: {
    format: 'terminal' | 'json' | 'markdown';
  };
}

// --- CLI Flags ---

export interface CliFlags {
  git?: boolean;
  format?: 'terminal' | 'json' | 'markdown';
  config?: string;
  path?: string;
  verbose?: boolean;
}
