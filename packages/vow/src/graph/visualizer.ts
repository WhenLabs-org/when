import chalk from 'chalk';
import { pkgKey } from '../types.js';
import type { DepGraph } from './builder.js';

export interface VisualizeOptions {
  maxDepth?: number;
  showLicense?: boolean;
  colorize?: boolean;
  filter?: string;
  direction?: 'top-down' | 'bottom-up';
}

function colorForCategory(category: string, text: string, colorize: boolean): string {
  if (!colorize) return text;
  switch (category) {
    case 'permissive':
    case 'public-domain':
      return chalk.green(text);
    case 'weakly-copyleft':
      return chalk.yellow(text);
    case 'strongly-copyleft':
    case 'network-copyleft':
      return chalk.red(text);
    case 'proprietary':
      return chalk.magenta(text);
    case 'unknown':
    case 'custom':
      return chalk.gray(text);
    default:
      return text;
  }
}

export function visualizeTree(graph: DepGraph, options: VisualizeOptions = {}): string {
  const {
    maxDepth,
    showLicense = true,
    colorize = true,
    filter,
    direction = 'top-down',
  } = options;

  if (direction === 'bottom-up' && filter) {
    return visualizeBottomUp(graph, filter, { showLicense, colorize, maxDepth });
  }

  return visualizeTopDown(graph, { maxDepth, showLicense, colorize, filter });
}

function visualizeTopDown(
  graph: DepGraph,
  options: { maxDepth?: number; showLicense: boolean; colorize: boolean; filter?: string },
): string {
  const lines: string[] = [];
  const rootNode = graph.getNode(graph.root);
  if (!rootNode) return '';

  const filterLower = options.filter?.toLowerCase();

  // Check if a subtree contains a matching node
  function subtreeContainsMatch(key: string, visited: Set<string>): boolean {
    if (!filterLower) return true;

    const node = graph.getNode(key);
    if (!node) return false;

    const expr = node.pkg.license.spdxExpression;
    if (expr && expr.toLowerCase().includes(filterLower)) return true;
    if (!expr && (filterLower === 'unknown' || filterLower === 'none')) return true;

    if (visited.has(key)) return false;
    visited.add(key);

    for (const dep of graph.getDependencies(key)) {
      if (subtreeContainsMatch(pkgKey(dep.pkg.name, dep.pkg.version), visited)) {
        return true;
      }
    }
    return false;
  }

  // Root line
  const rootLabel = `${rootNode.pkg.name}@${rootNode.pkg.version}`;
  lines.push(rootLabel);

  // Recursive tree render
  function renderNode(key: string, prefix: string, isLast: boolean, depth: number, visited: Set<string>): void {
    if (options.maxDepth !== undefined && depth > options.maxDepth) return;
    if (visited.has(key)) {
      const node = graph.getNode(key);
      if (node) {
        const connector = isLast ? '└── ' : '├── ';
        lines.push(`${prefix}${connector}${node.pkg.name}@${node.pkg.version} (circular)`);
      }
      return;
    }
    visited.add(key);

    const node = graph.getNode(key);
    if (!node) return;

    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    let label = `${node.pkg.name}@${node.pkg.version}`;
    if (options.showLicense) {
      const licenseStr = node.pkg.license.spdxExpression ?? 'UNKNOWN';
      label += ` (${colorForCategory(node.pkg.license.category, licenseStr, options.colorize)})`;
    }

    // Check if this node matches the filter for annotation
    if (filterLower) {
      const expr = node.pkg.license.spdxExpression;
      const matches = expr
        ? expr.toLowerCase().includes(filterLower)
        : (filterLower === 'unknown' || filterLower === 'none');
      if (matches) {
        label += options.colorize ? chalk.red(' ← MATCH') : ' ← MATCH';
      }
    }

    lines.push(`${prefix}${connector}${label}`);

    // Render children
    const deps = graph.getDependencies(key);
    const filteredDeps = filterLower
      ? deps.filter(d => subtreeContainsMatch(pkgKey(d.pkg.name, d.pkg.version), new Set(visited)))
      : deps;

    for (let i = 0; i < filteredDeps.length; i++) {
      const dep = filteredDeps[i]!;
      const depKey = pkgKey(dep.pkg.name, dep.pkg.version);
      renderNode(depKey, childPrefix, i === filteredDeps.length - 1, depth + 1, new Set(visited));
    }
  }

  const rootDeps = graph.getDependencies(graph.root);
  const filteredRootDeps = filterLower
    ? rootDeps.filter(d => subtreeContainsMatch(pkgKey(d.pkg.name, d.pkg.version), new Set()))
    : rootDeps;

  for (let i = 0; i < filteredRootDeps.length; i++) {
    const dep = filteredRootDeps[i]!;
    const depKey = pkgKey(dep.pkg.name, dep.pkg.version);
    renderNode(depKey, '', i === filteredRootDeps.length - 1, 1, new Set());
  }

  return lines.join('\n');
}

function visualizeBottomUp(
  graph: DepGraph,
  filter: string,
  options: { showLicense: boolean; colorize: boolean; maxDepth?: number },
): string {
  const filterLower = filter.toLowerCase();
  const lines: string[] = [];

  // Find all nodes matching the filter
  for (const node of graph.getAllNodes()) {
    if (node.pkg.name === graph.root.split('@')[0]) continue;

    const expr = node.pkg.license.spdxExpression;
    const matches = expr
      ? expr.toLowerCase().includes(filterLower)
      : (filterLower === 'unknown' || filterLower === 'none');

    if (!matches) continue;

    const licenseStr = expr ?? 'UNKNOWN';
    const label = `${node.pkg.name}@${node.pkg.version} (${colorForCategory(node.pkg.license.category, licenseStr, options.colorize)})`;
    const annotation = options.colorize ? chalk.red(' ← MATCH') : ' ← MATCH';
    lines.push(`${label}${annotation}`);

    // Show path to root
    const paths = graph.getPathToRoot(pkgKey(node.pkg.name, node.pkg.version));
    for (const path of paths) {
      for (let i = 1; i < path.length; i++) {
        const pkg = path[i]!;
        const indent = '└── ';
        const padding = '    '.repeat(i - 1);
        const pathLicense = pkg.license.spdxExpression ?? 'UNKNOWN';
        lines.push(`${padding}${indent}${pkg.name}@${pkg.version} (${pathLicense})`);
      }
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}
