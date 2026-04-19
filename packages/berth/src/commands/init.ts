import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { detectAllConfigured } from '../detectors/index.js';
import { formatJson } from '../reporters/json.js';

interface InitOptions extends GlobalOptions {
  dir?: string;
  force?: boolean;
  format?: 'js' | 'mjs' | 'json';
}

export async function initCommand(options: InitOptions): Promise<void> {
  const dir = path.resolve(options.dir || process.cwd());
  const format = options.format ?? 'js';
  const filename =
    format === 'json' ? '.berthrc.json' : format === 'mjs' ? 'berth.config.mjs' : 'berth.config.js';
  const target = path.join(dir, filename);

  try {
    await fs.access(target);
    if (!options.force) {
      if (options.json) {
        console.log(formatJson({ error: 'exists', target }));
      } else {
        console.error(chalk.red(`${filename} already exists. Pass --force to overwrite.`));
      }
      process.exitCode = 1;
      return;
    }
  } catch {
    // OK — file doesn't exist.
  }

  const { ports: configured } = await detectAllConfigured(dir);
  const projectName = path.basename(dir);

  // Deduplicate by port, preferring higher-confidence entries.
  const byPort = new Map<number, (typeof configured)[number]>();
  for (const p of configured) {
    const existing = byPort.get(p.port);
    if (!existing) {
      byPort.set(p.port, p);
      continue;
    }
    const rank = { high: 2, medium: 1, low: 0 };
    if (rank[p.confidence] > rank[existing.confidence]) byPort.set(p.port, p);
  }

  const portEntries: Record<string, number> = {};
  let i = 1;
  for (const port of Array.from(byPort.keys()).sort((a, b) => a - b)) {
    const p = byPort.get(port)!;
    // Use a short slug based on source + index.
    const key = slugFor(p.source, i);
    portEntries[key] = port;
    i++;
  }

  const config = {
    projectName,
    ports: portEntries,
  };

  const content = format === 'json' ? renderJson(config) : renderJs(config, format);
  await fs.writeFile(target, content, 'utf-8');

  if (options.json) {
    console.log(formatJson({ created: target, ports: portEntries }));
  } else {
    console.log(chalk.green(`Created ${path.relative(process.cwd(), target)}`));
    const count = Object.keys(portEntries).length;
    if (count > 0) {
      console.log(
        chalk.dim(`Pre-filled ${count} port${count === 1 ? '' : 's'} from detected config.`),
      );
    } else {
      console.log(chalk.dim('No ports detected — starter config written.'));
    }
  }
}

function slugFor(source: string, i: number): string {
  const base = source.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
  return `${base}-${i}`;
}

function renderJs(config: { projectName: string; ports: Record<string, number> }, format: 'js' | 'mjs'): string {
  const portLines = Object.entries(config.ports)
    .map(([k, v]) => `    ${JSON.stringify(k)}: ${v}`)
    .join(',\n');
  const body = `{
  projectName: ${JSON.stringify(config.projectName)},
  ports: {
${portLines}
  },
  // reservedRanges: [{ from: 5000, to: 5010, reason: "db" }],
  // frameworks: { disable: [] },
  // plugins: [],
}`;
  if (format === 'mjs') {
    return `export default ${body};\n`;
  }
  // plain .js — we publish as ESM (package "type": "module"), so export default works
  return `export default ${body};\n`;
}

function renderJson(config: { projectName: string; ports: Record<string, number> }): string {
  return JSON.stringify(config, null, 2) + '\n';
}
