import fs from 'node:fs/promises';
import path from 'node:path';
import type { Registry, RegisteredProject, ConfiguredPort } from '../types.js';
import { detectAllConfigured } from '../detectors/index.js';

export function resolveProjectName(dir: string, pkg?: Record<string, unknown>): string {
  if (pkg?.name && typeof pkg.name === 'string') return pkg.name;
  return path.basename(dir);
}

export async function registerProject(
  dir: string,
  registry: Registry,
): Promise<{ registry: Registry; project: RegisteredProject }> {
  const absDir = path.resolve(dir);
  const { ports } = await detectAllConfigured(absDir);

  let pkg: Record<string, unknown> | undefined;
  try {
    const content = await fs.readFile(path.join(absDir, 'package.json'), 'utf-8');
    pkg = JSON.parse(content);
  } catch {
    // No package.json
  }

  const projectName = resolveProjectName(absDir, pkg);
  const now = new Date().toISOString();

  const project: RegisteredProject = {
    name: projectName,
    directory: absDir,
    ports: ports.map((p) => ({
      port: p.port,
      source: p.source,
      sourceFile: p.sourceFile,
      description: p.context,
    })),
    registeredAt: registry.projects[projectName]?.registeredAt ?? now,
    updatedAt: now,
  };

  const updatedRegistry: Registry = {
    ...registry,
    projects: {
      ...registry.projects,
      [projectName]: project,
    },
  };

  return { registry: updatedRegistry, project };
}

export function unregisterProject(name: string, registry: Registry): Registry {
  const { [name]: _, ...rest } = registry.projects;
  return { ...registry, projects: rest };
}

export function getProjectByName(name: string, registry: Registry): RegisteredProject | undefined {
  return registry.projects[name];
}

export function getProjectByPort(port: number, registry: Registry): RegisteredProject | undefined {
  for (const project of Object.values(registry.projects)) {
    if (project.ports.some((p) => p.port === port)) return project;
  }
  return undefined;
}

export function getProjectForConfiguredPort(
  port: ConfiguredPort,
  registry: Registry,
): RegisteredProject | undefined {
  return Object.values(registry.projects).find((p) => p.directory === port.projectDir);
}
