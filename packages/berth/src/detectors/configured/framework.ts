import fs from 'node:fs/promises';
import path from 'node:path';
import type { BerthConfig, ConfiguredPort } from '../../types.js';
import { FRAMEWORK_DEFAULTS } from '../../utils/ports.js';

export async function detectFrameworkDefaults(
  dir: string,
  alreadyFoundPorts: Set<number>,
  config?: BerthConfig,
): Promise<ConfiguredPort[]> {
  const ports: ConfiguredPort[] = [];
  const projectName = config?.projectName ?? path.basename(dir);

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

  const disabled = new Set(config?.frameworks?.disable ?? []);
  const overrides = config?.frameworks?.override ?? {};

  for (const framework of FRAMEWORK_DEFAULTS) {
    if (disabled.has(framework.name)) continue;
    const effectivePort = overrides[framework.name] ?? framework.defaultPort;
    if (alreadyFoundPorts.has(effectivePort)) continue;

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
      const overridden = effectivePort !== framework.defaultPort;
      ports.push({
        port: effectivePort,
        source: 'framework-default',
        sourceFile: path.join(dir, 'package.json'),
        context: overridden
          ? `${framework.name} default port (overridden via berth.config)`
          : `${framework.name} default port`,
        projectDir: dir,
        projectName,
        confidence: 'low',
      });
      alreadyFoundPorts.add(effectivePort);
    }
  }

  return ports;
}
