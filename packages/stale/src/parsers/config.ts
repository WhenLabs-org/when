import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { PackageJsonFacts, DockerComposeFacts, VersionFacts } from '../types.js';

export async function parsePackageJson(projectPath: string): Promise<PackageJsonFacts | null> {
  try {
    const content = await readFile(join(projectPath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    return {
      scripts: pkg.scripts ?? {},
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {},
      engines: pkg.engines,
    };
  } catch {
    return null;
  }
}

export async function parseDockerCompose(projectPath: string): Promise<DockerComposeFacts | null> {
  const candidates = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

  for (const name of candidates) {
    try {
      const content = await readFile(join(projectPath, name), 'utf-8');
      const parsed = parseYaml(content);
      if (parsed?.services && typeof parsed.services === 'object') {
        return { services: Object.keys(parsed.services) };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function parseVersionFiles(projectPath: string): Promise<VersionFacts> {
  const facts: VersionFacts = {};

  // .nvmrc
  try {
    const content = await readFile(join(projectPath, '.nvmrc'), 'utf-8');
    facts.fromNvmrc = content.trim().replace(/^v/i, '');
  } catch {}

  // .node-version
  try {
    const content = await readFile(join(projectPath, '.node-version'), 'utf-8');
    facts.fromNodeVersion = content.trim().replace(/^v/i, '');
  } catch {}

  // Dockerfile
  try {
    const content = await readFile(join(projectPath, 'Dockerfile'), 'utf-8');
    const match = content.match(/FROM\s+node:(\d+[\d.]*)/i);
    if (match) facts.fromDockerfile = match[1];
  } catch {}

  return facts;
}
