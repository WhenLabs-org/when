import fs from 'node:fs/promises';
import path from 'node:path';
import { detectAllActive } from '../detectors/index.js';
import { gracefulKill, isDevProcess } from '../utils/process.js';
import type { KillOutput, Registry } from '../types.js';
import { getProjectByName } from '../registry/project.js';

export async function killPortProcess(port: number): Promise<KillOutput> {
  const { ports: activePorts } = await detectAllActive();
  const matching = activePorts.filter((p) => p.port === port);

  const killed: KillOutput['killed'] = [];
  const failed: KillOutput['failed'] = [];

  for (const proc of matching) {
    const success = await gracefulKill(proc.pid);
    if (success) {
      killed.push({ pid: proc.pid, port: proc.port, process: proc.process, project: proc.project });
    } else {
      failed.push({ pid: proc.pid, port: proc.port, error: 'Failed to kill process (permission denied or already dead)' });
    }
  }

  return { killed, failed, freedPorts: killed.map((k) => k.port) };
}

export async function killDevProcesses(): Promise<KillOutput> {
  const { ports: activePorts } = await detectAllActive();
  const devPorts = activePorts.filter(isDevProcess);

  const killed: KillOutput['killed'] = [];
  const failed: KillOutput['failed'] = [];

  for (const proc of devPorts) {
    const success = await gracefulKill(proc.pid);
    if (success) {
      killed.push({ pid: proc.pid, port: proc.port, process: proc.process, project: proc.project });
    } else {
      failed.push({ pid: proc.pid, port: proc.port, error: 'Failed to kill process' });
    }
  }

  const freedPorts = [...new Set(killed.map((k) => k.port))];
  return { killed, failed, freedPorts };
}

export async function freeProjectPorts(projectName: string, registry: Registry): Promise<KillOutput> {
  const project = getProjectByName(projectName, registry);
  if (!project) {
    return { killed: [], failed: [], freedPorts: [] };
  }

  const registeredPorts = new Set(project.ports.map((p) => p.port));
  const { ports: activePorts } = await detectAllActive();
  const matching = activePorts.filter((p) => registeredPorts.has(p.port));

  const killed: KillOutput['killed'] = [];
  const failed: KillOutput['failed'] = [];

  for (const proc of matching) {
    const success = await gracefulKill(proc.pid);
    if (success) {
      killed.push({ pid: proc.pid, port: proc.port, process: proc.process, project: projectName });
    } else {
      failed.push({ pid: proc.pid, port: proc.port, error: 'Failed to kill process' });
    }
  }

  const freedPorts = [...new Set(killed.map((k) => k.port))];
  return { killed, failed, freedPorts };
}

export async function reassignPort(
  projectDir: string,
  oldPort: number,
  newPort: number,
): Promise<{ filesModified: string[] }> {
  const filesModified: string[] = [];
  const oldStr = String(oldPort);
  const newStr = String(newPort);

  // .env files
  const envFiles = ['.env', '.env.local', '.env.development', '.env.dev'];
  for (const envFile of envFiles) {
    const filePath = path.join(projectDir, envFile);
    try {
      let content = await fs.readFile(filePath, 'utf-8');
      const original = content;

      // Replace PORT=<old> patterns contextually
      content = content.replace(
        new RegExp(`((?:^|\\n)[A-Z_]*PORT\\s*=\\s*)${oldStr}(\\s|$|\\n|#)`, 'g'),
        `$1${newStr}$2`,
      );

      // Replace port in URLs
      content = content.replace(
        new RegExp(`(://[^/:]+:)${oldStr}(/|\\s|$|\\n|")`, 'g'),
        `$1${newStr}$2`,
      );

      if (content !== original) {
        await fs.writeFile(filePath, content, 'utf-8');
        filesModified.push(filePath);
      }
    } catch {
      // File doesn't exist
    }
  }

  // docker-compose files
  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  for (const composeFile of composeFiles) {
    const filePath = path.join(projectDir, composeFile);
    try {
      let content = await fs.readFile(filePath, 'utf-8');
      const original = content;

      // Replace host port in "host:container" patterns
      content = content.replace(
        new RegExp(`(["']?)${oldStr}(:\\d+)`, 'g'),
        `$1${newStr}$2`,
      );

      if (content !== original) {
        await fs.writeFile(filePath, content, 'utf-8');
        filesModified.push(filePath);
      }
    } catch {
      // File doesn't exist
    }
  }

  // package.json
  const pkgPath = path.join(projectDir, 'package.json');
  try {
    let content = await fs.readFile(pkgPath, 'utf-8');
    const original = content;

    // Replace in script values contextually (--port, -p, PORT=)
    content = content.replace(
      new RegExp(`(--port[\\s=])${oldStr}(\\b)`, 'g'),
      `$1${newStr}$2`,
    );
    content = content.replace(
      new RegExp(`(-p[\\s=])${oldStr}(\\b)`, 'g'),
      `$1${newStr}$2`,
    );
    content = content.replace(
      new RegExp(`(PORT=)${oldStr}(\\b)`, 'g'),
      `$1${newStr}$2`,
    );

    if (content !== original) {
      await fs.writeFile(pkgPath, content, 'utf-8');
      filesModified.push(pkgPath);
    }
  } catch {
    // File doesn't exist
  }

  return { filesModified };
}
