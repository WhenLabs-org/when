import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfiguredPort } from '../../types.js';
import { FRAMEWORK_DEFAULTS } from '../../utils/ports.js';

export async function detectFrameworkDefaults(
  dir: string,
  alreadyFoundPorts: Set<number>,
): Promise<ConfiguredPort[]> {
  const ports: ConfiguredPort[] = [];
  const projectName = path.basename(dir);

  // Read package.json for dependency detection
  let pkg: Record<string, unknown> | null = null;
  try {
    const content = await fs.readFile(path.join(dir, 'package.json'), 'utf-8');
    pkg = JSON.parse(content);
  } catch {
    // No package.json, will only check file-based detection
  }

  const allDeps: Record<string, unknown> = {
    ...((pkg?.dependencies as Record<string, unknown>) || {}),
    ...((pkg?.devDependencies as Record<string, unknown>) || {}),
  };

  for (const framework of FRAMEWORK_DEFAULTS) {
    if (alreadyFoundPorts.has(framework.defaultPort)) continue;

    let detected = false;

    // Check by dependency
    if (framework.detectBy.dependency && framework.detectBy.dependency in allDeps) {
      detected = true;
    }

    // Check by file existence
    if (!detected && framework.detectBy.file) {
      const patterns = [
        framework.detectBy.file,
        `${framework.detectBy.file}.js`,
        `${framework.detectBy.file}.ts`,
        `${framework.detectBy.file}.mjs`,
        `${framework.detectBy.file}.cjs`,
      ];
      for (const p of patterns) {
        try {
          await fs.access(path.join(dir, p));
          detected = true;
          break;
        } catch {
          // file doesn't exist
        }
      }
    }

    if (detected) {
      ports.push({
        port: framework.defaultPort,
        source: 'framework-default',
        sourceFile: path.join(dir, 'package.json'),
        context: `${framework.name} default port`,
        projectDir: dir,
        projectName,
        confidence: 'low',
      });
      alreadyFoundPorts.add(framework.defaultPort);
    }
  }

  return ports;
}
