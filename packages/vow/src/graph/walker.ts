import type { DepGraphNode } from '../types.js';
import type { LicenseCategory } from '../types.js';
import { pkgKey } from '../types.js';
import type { DepGraph } from './builder.js';

export interface WalkOptions {
  filter?: (node: DepGraphNode) => boolean;
  maxDepth?: number;
  includeDev?: boolean;
  order?: 'bfs' | 'dfs';
}

export function* walkGraph(
  graph: DepGraph,
  options: WalkOptions = {},
): Generator<DepGraphNode> {
  const { filter, maxDepth, includeDev = true, order = 'bfs' } = options;
  const visited = new Set<string>();
  const rootKey = graph.root;

  if (!rootKey) return;

  if (order === 'bfs') {
    const queue: string[] = [rootKey];

    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);

      const node = graph.getNode(key);
      if (!node) continue;

      if (maxDepth !== undefined && node.depth > maxDepth) continue;
      if (!includeDev && node.pkg.dependencyType === 'dev') continue;

      if (key !== rootKey) {
        if (!filter || filter(node)) {
          yield node;
        }
      }

      for (const dep of graph.getDependencies(key)) {
        const depKey = pkgKey(dep.pkg.name, dep.pkg.version);
        if (!visited.has(depKey)) {
          queue.push(depKey);
        }
      }
    }
  } else {
    // DFS
    const stack: string[] = [rootKey];

    while (stack.length > 0) {
      const key = stack.pop()!;
      if (visited.has(key)) continue;
      visited.add(key);

      const node = graph.getNode(key);
      if (!node) continue;

      if (maxDepth !== undefined && node.depth > maxDepth) continue;
      if (!includeDev && node.pkg.dependencyType === 'dev') continue;

      if (key !== rootKey) {
        if (!filter || filter(node)) {
          yield node;
        }
      }

      const deps = graph.getDependencies(key);
      // Reverse so first dependency is popped first
      for (let i = deps.length - 1; i >= 0; i--) {
        const dep = deps[i]!;
        const depKey = pkgKey(dep.pkg.name, dep.pkg.version);
        if (!visited.has(depKey)) {
          stack.push(depKey);
        }
      }
    }
  }
}

export function filterByLicense(graph: DepGraph, licensePattern: string): DepGraphNode[] {
  const pattern = licensePattern.toLowerCase();
  return Array.from(
    walkGraph(graph, {
      filter: (node) => {
        const expr = node.pkg.license.spdxExpression;
        if (!expr) {
          return pattern === 'unknown' || pattern === 'none';
        }
        return expr.toLowerCase().includes(pattern);
      },
    }),
  );
}

export function filterByCategory(graph: DepGraph, category: LicenseCategory): DepGraphNode[] {
  return Array.from(
    walkGraph(graph, {
      filter: (node) => node.pkg.license.category === category,
    }),
  );
}
