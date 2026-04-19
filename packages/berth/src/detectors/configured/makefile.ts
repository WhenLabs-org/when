import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfiguredPort } from '../../types.js';
import { isValidPort } from '../../utils/ports.js';

const PORT_PATTERNS = [
  /--port[\s=](\d+)/g,
  /-p[\s=](\d+)/g,
  /PORT=(\d+)/g,
  /-l[\s=](\d+)/g,
  /localhost:(\d+)/g,
  /127\.0\.0\.1:(\d+)/g,
  /0\.0\.0\.0:(\d+)/g,
];

export async function detectFromMakefile(dir: string): Promise<ConfiguredPort[]> {
  const filePath = path.join(dir, 'Makefile');
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const ports: ConfiguredPort[] = [];
  const projectName = path.basename(dir);
  const foundPorts = new Set<number>();

  // Parse target blocks
  const lines = content.split('\n');
  let currentTarget = '';

  for (const line of lines) {
    const targetMatch = line.match(/^([a-zA-Z_][\w-]*):/);
    if (targetMatch) {
      currentTarget = targetMatch[1];
      continue;
    }

    // Only scan indented lines (recipe lines)
    if (!line.startsWith('\t') && !line.startsWith('  ')) continue;

    for (const pattern of PORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const port = parseInt(match[1], 10);
        if (isValidPort(port) && !foundPorts.has(port) && port > 1024) {
          foundPorts.add(port);
          ports.push({
            port,
            source: 'makefile',
            sourceFile: filePath,
            context: currentTarget ? `make ${currentTarget}: ${line.trim()}` : line.trim(),
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
