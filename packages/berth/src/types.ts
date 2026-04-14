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
  | 'framework-default';

export interface ActivePort {
  port: number;
  pid: number;
  process: string;
  command: string;
  user: string;
  protocol: 'tcp' | 'udp';
  address: string;
  source: 'lsof' | 'netstat';
  project?: string;
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

export interface Registry {
  version: 1;
  projects: Record<string, RegisteredProject>;
}

export interface StatusOutput {
  active: ActivePort[];
  docker: DockerPort[];
  configured: ConfiguredPort[];
  conflicts: Conflict[];
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
