import { detectActivePorts as detectLsof } from './active/lsof.js';
import { detectActivePorts as detectNetstat } from './active/netstat.js';
import { detectDockerPorts } from './active/docker.js';
import { detectFromDotenv } from './configured/dotenv.js';
import { detectFromPackageJson } from './configured/package-json.js';
import { detectFromDockerCompose } from './configured/docker-compose.js';
import { detectFromProcfile } from './configured/procfile.js';
import { detectFromMakefile } from './configured/makefile.js';
import { detectFrameworkDefaults } from './configured/framework.js';
import { detectFromBerthConfig } from './configured/berthrc.js';
import { detectFromDevcontainer } from './configured/devcontainer.js';
import {
  defineActiveDetector,
  defineConfiguredDetector,
  defineDockerDetector,
} from './api.js';
import type { DetectorRegistry } from './registry.js';
import type { BerthConfig, ConfiguredPort } from '../types.js';

export const lsofDetector = defineActiveDetector({
  name: 'lsof',
  kind: 'active',
  platforms: ['darwin', 'linux'],
  async detect() {
    return detectLsof();
  },
});

export const netstatDetector = defineActiveDetector({
  name: 'netstat',
  kind: 'active',
  platforms: ['win32'],
  async detect() {
    return detectNetstat();
  },
});

export const dockerDetector = defineDockerDetector({
  name: 'docker',
  kind: 'docker',
  async detect() {
    return detectDockerPorts();
  },
});

export const dotenvDetector = defineConfiguredDetector({
  name: 'dotenv',
  kind: 'configured',
  async detect({ dir }) {
    return detectFromDotenv(dir);
  },
});

export const packageJsonDetector = defineConfiguredDetector({
  name: 'package-json',
  kind: 'configured',
  async detect({ dir }) {
    return detectFromPackageJson(dir);
  },
});

export const dockerComposeDetector = defineConfiguredDetector({
  name: 'docker-compose',
  kind: 'configured',
  async detect({ dir }) {
    return detectFromDockerCompose(dir);
  },
});

export const procfileDetector = defineConfiguredDetector({
  name: 'procfile',
  kind: 'configured',
  async detect({ dir }) {
    return detectFromProcfile(dir);
  },
});

export const makefileDetector = defineConfiguredDetector({
  name: 'makefile',
  kind: 'configured',
  async detect({ dir }) {
    return detectFromMakefile(dir);
  },
});

export const berthrcDetector = defineConfiguredDetector({
  name: 'berthrc',
  kind: 'configured',
  async detect({ dir, config }) {
    if (!config) return [];
    return detectFromBerthConfig(dir, config);
  },
});

export const devcontainerDetector = defineConfiguredDetector({
  name: 'devcontainer',
  kind: 'configured',
  async detect({ dir }) {
    return detectFromDevcontainer(dir);
  },
});

/**
 * Framework-defaults detector. Unlike the others, it must know which ports
 * are already claimed. The scan runner passes that in via a special hook;
 * for registration purposes we expose a `run()` API rather than `detect()`.
 */
export async function runFrameworkDefaults(
  dir: string,
  alreadyFound: Set<number>,
  config: BerthConfig | undefined,
): Promise<ConfiguredPort[]> {
  return detectFrameworkDefaults(dir, alreadyFound, config);
}

export function registerBuiltins(registry: DetectorRegistry): void {
  registry.registerActive(lsofDetector);
  registry.registerActive(netstatDetector);
  registry.registerDocker(dockerDetector);
  registry.registerConfigured(dotenvDetector);
  registry.registerConfigured(packageJsonDetector);
  registry.registerConfigured(dockerComposeDetector);
  registry.registerConfigured(procfileDetector);
  registry.registerConfigured(makefileDetector);
  registry.registerConfigured(berthrcDetector);
  registry.registerConfigured(devcontainerDetector);
}
