import { getCurrentPlatform } from '../utils/platform.js';
import { detectActivePorts as detectLsof } from './active/lsof.js';
import { detectActivePorts as detectNetstat } from './active/netstat.js';
import { detectDockerPorts } from './active/docker.js';
import { detectFromDotenv } from './configured/dotenv.js';
import { detectFromPackageJson } from './configured/package-json.js';
import { detectFromDockerCompose } from './configured/docker-compose.js';
import { detectFromProcfile } from './configured/procfile.js';
import { detectFromMakefile } from './configured/makefile.js';
import { detectFrameworkDefaults } from './configured/framework.js';
import type { ActivePort, DockerPort, ConfiguredPort } from '../types.js';

export interface ActiveDetectionResult {
  ports: ActivePort[];
  docker: DockerPort[];
  warnings: string[];
}

export interface ConfiguredDetectionResult {
  ports: ConfiguredPort[];
  warnings: string[];
}

export async function detectAllActive(): Promise<ActiveDetectionResult> {
  const warnings: string[] = [];
  let ports: ActivePort[] = [];
  let docker: DockerPort[] = [];

  const platform = getCurrentPlatform();
  const detectFn = platform === 'win32' ? detectNetstat : detectLsof;

  const results = await Promise.allSettled([detectFn(), detectDockerPorts()]);

  if (results[0].status === 'fulfilled') {
    ports = results[0].value;
  } else {
    warnings.push(`Active port detection failed: ${results[0].reason}`);
  }

  if (results[1].status === 'fulfilled') {
    docker = results[1].value;
  } else {
    warnings.push(`Docker port detection failed: ${results[1].reason}`);
  }

  return { ports, docker, warnings };
}

export async function detectAllConfigured(dir: string): Promise<ConfiguredDetectionResult> {
  const warnings: string[] = [];
  const allPorts: ConfiguredPort[] = [];

  const detectors = [
    { name: 'dotenv', fn: () => detectFromDotenv(dir) },
    { name: 'package-json', fn: () => detectFromPackageJson(dir) },
    { name: 'docker-compose', fn: () => detectFromDockerCompose(dir) },
    { name: 'procfile', fn: () => detectFromProcfile(dir) },
    { name: 'makefile', fn: () => detectFromMakefile(dir) },
  ];

  const results = await Promise.allSettled(detectors.map((d) => d.fn()));

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      allPorts.push(...(results[i] as PromiseFulfilledResult<ConfiguredPort[]>).value);
    } else {
      warnings.push(`${detectors[i].name} detection failed: ${(results[i] as PromiseRejectedResult).reason}`);
    }
  }

  // Framework defaults run last, knowing which ports are already found
  const foundPorts = new Set(allPorts.map((p) => p.port));
  try {
    const frameworkPorts = await detectFrameworkDefaults(dir, foundPorts);
    allPorts.push(...frameworkPorts);
  } catch (e) {
    warnings.push(`Framework detection failed: ${e}`);
  }

  return { ports: allPorts, warnings };
}
