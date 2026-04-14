import type { PackageInfo, DepGraphNode } from '../types.js';
import { pkgKey } from '../types.js';
import type { ResolvedPackage } from '../resolvers/base.js';

export class DepGraph {
  private nodes = new Map<string, DepGraphNode>();
  private rootKey: string = '';

  addNode(pkg: PackageInfo): void {
    const key = pkgKey(pkg.name, pkg.version);
    if (!this.nodes.has(key)) {
      this.nodes.set(key, {
        pkg,
        dependencies: new Map(),
        dependents: new Map(),
        depth: Infinity,
      });
    }
  }

  addEdge(fromKey: string, toKey: string): void {
    const fromNode = this.nodes.get(fromKey);
    const toNode = this.nodes.get(toKey);
    if (!fromNode || !toNode) return;

    const toName = toNode.pkg.name;
    const fromName = fromNode.pkg.name;

    fromNode.dependencies.set(toName, toNode.pkg.version);
    toNode.dependents.set(fromName, fromNode.pkg.version);
  }

  setRoot(key: string): void {
    this.rootKey = key;
    this.computeDepths();
  }

  getNode(key: string): DepGraphNode | undefined {
    return this.nodes.get(key);
  }

  getAllNodes(): DepGraphNode[] {
    return Array.from(this.nodes.values());
  }

  getDependencies(key: string): DepGraphNode[] {
    const node = this.nodes.get(key);
    if (!node) return [];

    const deps: DepGraphNode[] = [];
    for (const [name, version] of node.dependencies) {
      const depNode = this.nodes.get(pkgKey(name, version));
      if (depNode) deps.push(depNode);
    }
    return deps;
  }

  getDependents(key: string): DepGraphNode[] {
    const node = this.nodes.get(key);
    if (!node) return [];

    const deps: DepGraphNode[] = [];
    for (const [name, version] of node.dependents) {
      const depNode = this.nodes.get(pkgKey(name, version));
      if (depNode) deps.push(depNode);
    }
    return deps;
  }

  getPathToRoot(key: string, maxPaths: number = 5): PackageInfo[][] {
    if (!this.rootKey || key === this.rootKey) return [];

    const paths: PackageInfo[][] = [];
    const queue: Array<{ currentKey: string; path: PackageInfo[] }> = [
      { currentKey: key, path: [] },
    ];
    const visited = new Set<string>();

    while (queue.length > 0 && paths.length < maxPaths) {
      const item = queue.shift()!;
      const node = this.nodes.get(item.currentKey);
      if (!node) continue;

      const currentPath = [...item.path, node.pkg];

      if (item.currentKey === this.rootKey) {
        paths.push(currentPath);
        continue;
      }

      if (visited.has(item.currentKey)) continue;
      visited.add(item.currentKey);

      for (const [name, version] of node.dependents) {
        queue.push({
          currentKey: pkgKey(name, version),
          path: currentPath,
        });
      }
    }

    return paths;
  }

  getPackagesAtDepth(depth: number): PackageInfo[] {
    return this.getAllNodes()
      .filter(n => n.depth === depth)
      .map(n => n.pkg);
  }

  getCycles(): string[][] {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const cycles: string[][] = [];

    for (const key of this.nodes.keys()) {
      color.set(key, WHITE);
    }

    const dfs = (key: string, path: string[]): void => {
      color.set(key, GRAY);
      path.push(key);

      const node = this.nodes.get(key);
      if (node) {
        for (const [name, version] of node.dependencies) {
          const depKey = pkgKey(name, version);
          const depColor = color.get(depKey);

          if (depColor === GRAY) {
            // Found a cycle
            const cycleStart = path.indexOf(depKey);
            if (cycleStart >= 0) {
              cycles.push(path.slice(cycleStart));
            }
          } else if (depColor === WHITE) {
            dfs(depKey, path);
          }
        }
      }

      path.pop();
      color.set(key, BLACK);
    };

    for (const key of this.nodes.keys()) {
      if (color.get(key) === WHITE) {
        dfs(key, []);
      }
    }

    return cycles;
  }

  get size(): number {
    return this.nodes.size;
  }

  get root(): string {
    return this.rootKey;
  }

  toJSON(): Record<string, {
    pkg: PackageInfo;
    dependencies: Record<string, string>;
    dependents: Record<string, string>;
    depth: number;
  }> {
    const result: Record<string, {
      pkg: PackageInfo;
      dependencies: Record<string, string>;
      dependents: Record<string, string>;
      depth: number;
    }> = {};

    for (const [key, node] of this.nodes) {
      result[key] = {
        pkg: node.pkg,
        dependencies: Object.fromEntries(node.dependencies),
        dependents: Object.fromEntries(node.dependents),
        depth: node.depth,
      };
    }

    return result;
  }

  private computeDepths(): void {
    if (!this.rootKey) return;

    // Reset depths
    for (const node of this.nodes.values()) {
      node.depth = Infinity;
    }

    // BFS from root
    const queue: Array<{ key: string; depth: number }> = [
      { key: this.rootKey, depth: 0 },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { key, depth } = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);

      const node = this.nodes.get(key);
      if (!node) continue;

      node.depth = Math.min(node.depth, depth);

      for (const [name, version] of node.dependencies) {
        const depKey = pkgKey(name, version);
        if (!visited.has(depKey)) {
          queue.push({ key: depKey, depth: depth + 1 });
        }
      }
    }
  }
}

export function buildGraph(
  resolvedPackages: ResolvedPackage[],
  rootName: string,
  rootVersion: string,
): DepGraph {
  const graph = new DepGraph();

  // Add root node
  const rootPkg: PackageInfo = {
    name: rootName,
    version: rootVersion,
    license: {
      spdxExpression: null,
      source: 'none',
      confidence: 0,
      category: 'unknown',
    },
    dependencyType: 'production',
  };
  graph.addNode(rootPkg);

  // Build a map for quick lookup: name -> resolved package
  const packageMap = new Map<string, ResolvedPackage>();
  for (const pkg of resolvedPackages) {
    graph.addNode({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      dependencyType: pkg.dependencyType,
      path: pkg.path,
      rawLicense: pkg.rawLicense,
    });
    packageMap.set(pkg.name, pkg);
  }

  // Add root -> direct dependency edges
  for (const pkg of resolvedPackages) {
    // Check if it's a direct dependency of the root
    const node = graph.getNode(pkgKey(pkg.name, pkg.version));
    if (!node) continue;

    // Add edges from each package to its dependencies
    for (const depName of pkg.dependencies) {
      const depPkg = packageMap.get(depName);
      if (depPkg) {
        graph.addEdge(
          pkgKey(pkg.name, pkg.version),
          pkgKey(depPkg.name, depPkg.version),
        );
      }
    }
  }

  // Connect root to direct dependencies
  for (const pkg of resolvedPackages) {
    const isDirectDep = pkg.dependencyType !== 'production' || packageMap.has(pkg.name);
    if (isDirectDep) {
      // Check depth — will be calculated in setRoot
      graph.addEdge(pkgKey(rootName, rootVersion), pkgKey(pkg.name, pkg.version));
    }
  }

  graph.setRoot(pkgKey(rootName, rootVersion));

  return graph;
}
