import type { GlobalOptions } from '../types.js';
import { loadRegistry } from '../registry/store.js';
import { detectAllActive } from '../detectors/index.js';
import { renderList } from '../reporters/terminal.js';
import { formatJson } from '../reporters/json.js';

export async function listCommand(options: GlobalOptions): Promise<void> {
  const [registry, { ports: active }] = await Promise.all([loadRegistry(), detectAllActive()]);

  const projects = Object.values(registry.projects);

  if (options.json) {
    const activePortSet = new Set(active.map((p) => p.port));
    const output = projects.map((project) => ({
      ...project,
      status: project.ports.length === 0
        ? 'empty'
        : project.ports.every((p) => activePortSet.has(p.port))
          ? 'running'
          : project.ports.some((p) => activePortSet.has(p.port))
            ? 'partial'
            : 'stopped',
    }));
    console.log(formatJson(output));
  } else {
    console.log(renderList(projects, active));
  }
}
