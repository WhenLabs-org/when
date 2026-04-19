import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ConfiguredPort } from '../../types.js';
import { isValidPort } from '../../utils/ports.js';

const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
];

export async function detectFromDockerCompose(dir: string): Promise<ConfiguredPort[]> {
  const ports: ConfiguredPort[] = [];
  const projectName = path.basename(dir);

  for (const composeFile of COMPOSE_FILES) {
    const filePath = path.join(dir, composeFile);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    let doc;
    try {
      doc = parseYaml(content);
    } catch {
      continue;
    }

    if (!doc || typeof doc !== 'object') continue;

    const services = doc.services;
    if (!services || typeof services !== 'object') continue;

    for (const [serviceName, service] of Object.entries(services)) {
      if (!service || typeof service !== 'object') continue;
      const svc = service as Record<string, unknown>;

      // Parse ports array
      if (Array.isArray(svc.ports)) {
        for (const portEntry of svc.ports) {
          const parsed = parsePortEntry(portEntry);
          for (const hostPort of parsed) {
            if (isValidPort(hostPort)) {
              ports.push({
                port: hostPort,
                source: 'docker-compose',
                sourceFile: filePath,
                context: `services.${serviceName}.ports: ${JSON.stringify(portEntry)}`,
                projectDir: dir,
                projectName,
                confidence: 'high',
              });
            }
          }
        }
      }

      // Check environment for PORT-like vars
      if (svc.environment) {
        const envPorts = parseEnvironmentPorts(svc.environment, serviceName, filePath, dir, projectName);
        ports.push(...envPorts);
      }
    }
  }

  return ports;
}

function parsePortEntry(entry: unknown): number[] {
  if (typeof entry === 'number') {
    return [entry];
  }

  if (typeof entry === 'string') {
    return parsePortString(entry);
  }

  // Long syntax: { target: 3000, published: 3000, protocol: tcp }
  if (typeof entry === 'object' && entry !== null) {
    const obj = entry as Record<string, unknown>;
    const published = obj.published;
    if (typeof published === 'number') return [published];
    if (typeof published === 'string') {
      const port = resolveVariable(published);
      if (port !== null) return [port];
    }
  }

  return [];
}

function parsePortString(s: string): number[] {
  // Resolve variable interpolation like ${PORT:-3000}
  const resolved = s.replace(/\$\{[^:}]+:-(\d+)\}/g, '$1');

  // Remove protocol suffix
  const withoutProtocol = resolved.replace(/\/(tcp|udp)$/, '');

  // Split on colon to get parts
  const parts = withoutProtocol.split(':');

  if (parts.length === 1) {
    // Just a port number or range (container-only, skip)
    return [];
  }

  // Last part is container port, second-to-last is host port
  const hostPart = parts.length === 3 ? parts[1] : parts[0];
  const ports: number[] = [];

  // Handle port ranges like "3000-3005"
  const rangeMatch = hostPart.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    for (let p = start; p <= end && p - start < 100; p++) {
      if (isValidPort(p)) ports.push(p);
    }
    return ports;
  }

  const port = parseInt(hostPart, 10);
  if (!isNaN(port) && isValidPort(port)) ports.push(port);

  return ports;
}

function resolveVariable(s: string): number | null {
  // Handle ${VAR:-default}
  const defaultMatch = s.match(/\$\{[^:}]+:-(\d+)\}/);
  if (defaultMatch) return parseInt(defaultMatch[1], 10);

  const num = parseInt(s, 10);
  return isNaN(num) ? null : num;
}

function parseEnvironmentPorts(
  env: unknown,
  serviceName: string,
  filePath: string,
  dir: string,
  projectName: string,
): ConfiguredPort[] {
  const ports: ConfiguredPort[] = [];
  const portKeyPattern = /^(PORT|.*_PORT)$/i;

  if (Array.isArray(env)) {
    // Array format: ["PORT=3000", "DB_PORT=5432"]
    for (const item of env) {
      if (typeof item !== 'string') continue;
      const [key, value] = item.split('=');
      if (!key || !value) continue;
      if (!portKeyPattern.test(key)) continue;

      const resolved = resolveVariable(value);
      if (resolved !== null && isValidPort(resolved)) {
        ports.push({
          port: resolved,
          source: 'docker-compose',
          sourceFile: filePath,
          context: `services.${serviceName}.environment: ${item}`,
          projectDir: dir,
          projectName,
          confidence: 'medium',
        });
      }
    }
  } else if (typeof env === 'object' && env !== null) {
    // Object format: { PORT: 3000, DB_PORT: 5432 }
    for (const [key, value] of Object.entries(env)) {
      if (!portKeyPattern.test(key)) continue;
      const strValue = String(value);
      const resolved = resolveVariable(strValue);
      if (resolved !== null && isValidPort(resolved)) {
        ports.push({
          port: resolved,
          source: 'docker-compose',
          sourceFile: filePath,
          context: `services.${serviceName}.environment.${key}=${strValue}`,
          projectDir: dir,
          projectName,
          confidence: 'medium',
        });
      }
    }
  }

  return ports;
}
