import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import type { ConfiguredPort } from '../../types.js';
import { isValidPort, FRAMEWORK_DEFAULTS } from '../../utils/ports.js';

const PORT_PATTERNS = [
  /--port[\s=](\d+)/g,
  /-p[\s=](\d+)/g,
  /PORT=(\d+)/g,
  /-l[\s=](\d+)/g,
  /--listen[\s=](\d+)/g,
];

export async function detectFromPackageJson(dir: string): Promise<ConfiguredPort[]> {
  const filePath = path.join(dir, 'package.json');
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const pkg = parseJsonc(content);
  if (!pkg || typeof pkg !== 'object') return [];

  const ports: ConfiguredPort[] = [];
  const projectName = pkg.name || path.basename(dir);
  const foundPorts = new Set<number>();

  // Scan scripts for port references
  if (pkg.scripts && typeof pkg.scripts === 'object') {
    for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
      if (typeof scriptValue !== 'string') continue;

      for (const pattern of PORT_PATTERNS) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(scriptValue)) !== null) {
          const port = parseInt(match[1], 10);
          if (isValidPort(port) && !foundPorts.has(port)) {
            foundPorts.add(port);
            ports.push({
              port,
              source: 'package-json',
              sourceFile: filePath,
              context: `scripts.${scriptName}: ${scriptValue}`,
              projectDir: dir,
              projectName,
              confidence: 'high',
            });
          }
        }
      }
    }
  }

  // Check for framework defaults if no explicit ports found
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  for (const framework of FRAMEWORK_DEFAULTS) {
    if (!framework.detectBy.dependency) continue;
    if (!(framework.detectBy.dependency in allDeps)) continue;
    if (foundPorts.has(framework.defaultPort)) continue;

    // Check if the framework command appears in scripts
    let hasCommand = false;
    if (framework.detectBy.command && pkg.scripts) {
      hasCommand = Object.values(pkg.scripts).some(
        (s) => typeof s === 'string' && s.includes(framework.detectBy.command!),
      );
    }

    ports.push({
      port: framework.defaultPort,
      source: 'package-json',
      sourceFile: filePath,
      context: `${framework.name} default (dependency: ${framework.detectBy.dependency})`,
      projectDir: dir,
      projectName,
      confidence: hasCommand ? 'medium' : 'low',
    });
    foundPorts.add(framework.defaultPort);
  }

  return ports;
}
