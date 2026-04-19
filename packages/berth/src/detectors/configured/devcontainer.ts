import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import type { ConfiguredPort } from '../../types.js';
import { isValidPort } from '../../utils/ports.js';

const CANDIDATES = ['.devcontainer/devcontainer.json', '.devcontainer.json'];

interface DevcontainerJson {
  name?: string;
  forwardPorts?: Array<number | string>;
  appPort?: number | string | Array<number | string>;
  portsAttributes?: Record<string, { label?: string; onAutoForward?: string }>;
}

export async function detectFromDevcontainer(dir: string): Promise<ConfiguredPort[]> {
  let filePath: string | undefined;
  let content: string | undefined;
  for (const rel of CANDIDATES) {
    const candidate = path.join(dir, rel);
    try {
      content = await fs.readFile(candidate, 'utf-8');
      filePath = candidate;
      break;
    } catch {
      // next candidate
    }
  }
  if (!filePath || !content) return [];

  const errors: import('jsonc-parser').ParseError[] = [];
  const parsed = parseJsonc(content, errors, { allowTrailingComma: true }) as
    | DevcontainerJson
    | undefined;
  if (!parsed || typeof parsed !== 'object') return [];

  const projectName = parsed.name ?? path.basename(dir);
  const seen = new Set<number>();
  const ports: ConfiguredPort[] = [];

  const addPort = (raw: number | string, context: string, confidence: 'high' | 'medium') => {
    const port = typeof raw === 'number' ? raw : parseInt(raw, 10);
    if (!isValidPort(port) || seen.has(port)) return;
    seen.add(port);
    ports.push({
      port,
      source: 'docker-compose', // closest existing PortSourceType family
      sourceFile: filePath!,
      context,
      projectDir: dir,
      projectName,
      confidence,
    });
  };

  if (parsed.forwardPorts) {
    for (const p of parsed.forwardPorts) addPort(p, `forwardPorts[${p}]`, 'high');
  }
  if (parsed.appPort !== undefined) {
    const list = Array.isArray(parsed.appPort) ? parsed.appPort : [parsed.appPort];
    for (const p of list) addPort(p, `appPort`, 'high');
  }
  if (parsed.portsAttributes) {
    for (const [key, value] of Object.entries(parsed.portsAttributes)) {
      const port = parseInt(key, 10);
      const label = value?.label ?? 'portsAttributes';
      if (!isValidPort(port) || seen.has(port)) continue;
      addPort(port, `portsAttributes.${port}: ${label}`, 'medium');
    }
  }

  return ports;
}
