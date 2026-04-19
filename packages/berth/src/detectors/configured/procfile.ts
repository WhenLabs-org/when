import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfiguredPort } from '../../types.js';
import { isValidPort } from '../../utils/ports.js';

const PORT_PATTERNS = [
  /--port[\s=](\d+)/g,
  /-p[\s=](\d+)/g,
  /PORT=(\d+)/g,
  /-l[\s=](\d+)/g,
];

export async function detectFromProcfile(dir: string): Promise<ConfiguredPort[]> {
  const filePath = path.join(dir, 'Procfile');
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const ports: ConfiguredPort[] = [];
  const projectName = path.basename(dir);
  const lines = content.trim().split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const processName = line.substring(0, colonIdx).trim();
    const command = line.substring(colonIdx + 1).trim();

    for (const pattern of PORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(command)) !== null) {
        const port = parseInt(match[1], 10);
        if (isValidPort(port)) {
          ports.push({
            port,
            source: 'procfile',
            sourceFile: filePath,
            context: `${processName}: ${command}`,
            projectDir: dir,
            projectName,
            confidence: 'medium',
          });
        }
      }
    }
  }

  return ports;
}
