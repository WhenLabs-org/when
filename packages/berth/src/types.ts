export type Platform = 'darwin' | 'linux' | 'win32';

export type PortSourceType =
  | 'lsof'
  | 'netstat'
  | 'docker'
  | 'package-json'
  | 'dotenv'
  | 'docker-compose'
  | 'procfile'
  | 'makefile'
  | 'framework-default'
  | 'berthrc';

export type TerminalHostKind =
  | 'tmux'
  | 'screen'
  | 'vscode'
  | 'iterm'
  | 'kitty'
  | 'apple-terminal'
  | 'windows-terminal'
  | 'unknown';

export interface TerminalHost {
  kind: TerminalHostKind;
  pane?: string;
  windowTitle?: string;
}

export interface ProcessAncestry {
  pid: number;
  startedAt?: string;
  parents: Array<{ pid: number; command: string; args?: string }>;
  terminal?: TerminalHost;
}

export interface ActivePort {
  port: number;
  pid: number;
  process: string;
  command: string;
  user: string;
  protocol: 'tcp' | 'udp';
  address: string;
  source: 'lsof' | 'netstat' | 'ss';
  project?: string;
  ancestry?: ProcessAncestry;
}

export interface DockerPort {
  port: number;
  containerPort: number;
  containerId: string;
  containerName: string;
  image: string;
  protocol: 'tcp' | 'udp';
  status: string;
  project?: string;
}

export interface ConfiguredPort {
  port: number;
  source: PortSourceType;
  sourceFile: string;
  sourceLine?: number;
  context: string;
  projectDir: string;
  projectName: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface PortInfo {
  port: number;
  active?: ActivePort;
  docker?: DockerPort;
  configured: ConfiguredPort[];
  status: 'active' | 'docker' | 'configured' | 'free';
}

export interface Conflict {
  port: number;
  claimants: Array<ActivePort | DockerPort | ConfiguredPort>;
  severity: 'error' | 'warning';
  suggestion: string;
}

export interface Resolution {
  type: 'kill' | 'reassign' | 'remap-docker' | 'stop-service';
  description: string;
  port: number;
  targetPort?: number;
  pid?: number;
  containerName?: string;
  projectName?: string;
  automatic: boolean;
}

export interface RegisteredPort {
  port: number;
  source: PortSourceType;
  sourceFile: string;
  description: string;
}

export interface RegisteredProject {
  name: string;
  directory: string;
  ports: RegisteredPort[];
  registeredAt: string;
  updatedAt: string;
}

export interface Reservation {
  port: number;
  project: string;
  reason?: string;
  createdAt: string;
  expiresAt?: string;
  source: 'manual' | 'berthrc' | 'team';
}

export interface Registry {
  version: 2;
  projects: Record<string, RegisteredProject>;
  reservations: Reservation[];
  meta?: { lastMigratedFrom?: number };
}

export interface RegistryV1 {
  version: 1;
  projects: Record<string, RegisteredProject>;
}

export interface BerthConfigPortEntry {
  port: number;
  required?: boolean;
  description?: string;
}

export interface BerthConfig {
  projectName?: string;
  ports?: Record<string, number | BerthConfigPortEntry>;
  aliases?: Record<string, string>;
  reservedRanges?: Array<{ from: number; to: number; reason?: string }>;
  frameworks?: {
    disable?: string[];
    override?: Record<string, number>;
  };
  plugins?: string[];
  extends?: string;
  apiVersion?: 1;
}

export interface LoadedConfig {
  config: BerthConfig;
  filePath: string;
  format: 'js' | 'mjs' | 'cjs' | 'json' | 'rc' | 'package-json';
}

export interface TeamAssignment {
  port: number;
  project: string;
  role?: string;
  owner?: string;
}

export interface TeamReservedRange {
  from: number;
  to: number;
  purpose: string;
}

export interface TeamForbidden {
  port: number;
  reason: string;
}

export interface TeamPolicy {
  killBlockingProcesses?: 'never' | 'devOnly' | 'always';
  onConflict?: 'warn' | 'error';
}

export interface TeamConfig {
  version: 1;
  assignments: TeamAssignment[];
  reservedRanges?: TeamReservedRange[];
  forbidden?: TeamForbidden[];
  policies?: TeamPolicy;
}

export interface LoadedTeamConfig {
  config: TeamConfig;
  filePath: string;
}

export type EnvironmentKind =
  | 'host'
  | 'wsl2'
  | 'devcontainer'
  | 'docker-container'
  | 'ssh';

export interface EnvironmentInfo {
  kind: EnvironmentKind;
  detail?: string;
}

export interface StatusOutput {
  active: ActivePort[];
  docker: DockerPort[];
  configured: ConfiguredPort[];
  conflicts: Conflict[];
  environment?: EnvironmentInfo;
  summary: {
    activePorts: number;
    dockerPorts: number;
    configuredPorts: number;
    conflictCount: number;
  };
}

export interface CheckOutput {
  project: string;
  directory: string;
  scannedSources: Array<{ file: string; type: PortSourceType; portsFound: number }>;
  conflicts: Conflict[];
  resolutions: Resolution[];
}

export interface KillOutput {
  killed: Array<{ pid: number; port: number; process: string; project?: string }>;
  failed: Array<{ pid: number; port: number; error: string }>;
  freedPorts: number[];
}

export interface FrameworkDefault {
  name: string;
  defaultPort: number;
  detectBy: {
    dependency?: string;
    file?: string;
    command?: string;
  };
}

export interface GlobalOptions {
  json: boolean;
  verbose: boolean;
  noColor: boolean;
}
