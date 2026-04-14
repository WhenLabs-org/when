import { describe, it, expect } from 'vitest';
import { DepGraph, buildGraph } from '../../src/graph/builder.js';
import type { ResolvedPackage } from '../../src/resolvers/base.js';
import { pkgKey } from '../../src/types.js';

function makePkg(name: string, version: string, license: string, deps: string[] = []): ResolvedPackage {
  return {
    name,
    version,
    license: {
      spdxExpression: license,
      source: 'package-metadata',
      confidence: 1,
      category: 'permissive',
    },
    dependencyType: 'production',
    dependencies: deps,
  };
}

describe('DepGraph', () => {
  it('adds nodes and edges', () => {
    const graph = new DepGraph();
    graph.addNode({ name: 'a', version: '1.0.0', license: { spdxExpression: 'MIT', source: 'package-metadata', confidence: 1, category: 'permissive' }, dependencyType: 'production' });
    graph.addNode({ name: 'b', version: '1.0.0', license: { spdxExpression: 'MIT', source: 'package-metadata', confidence: 1, category: 'permissive' }, dependencyType: 'production' });

    graph.addEdge('a@1.0.0', 'b@1.0.0');

    expect(graph.size).toBe(2);
    expect(graph.getDependencies('a@1.0.0').length).toBe(1);
    expect(graph.getDependents('b@1.0.0').length).toBe(1);
  });

  it('detects cycles', () => {
    const graph = new DepGraph();
    graph.addNode({ name: 'a', version: '1.0.0', license: { spdxExpression: 'MIT', source: 'package-metadata', confidence: 1, category: 'permissive' }, dependencyType: 'production' });
    graph.addNode({ name: 'b', version: '1.0.0', license: { spdxExpression: 'MIT', source: 'package-metadata', confidence: 1, category: 'permissive' }, dependencyType: 'production' });

    graph.addEdge('a@1.0.0', 'b@1.0.0');
    graph.addEdge('b@1.0.0', 'a@1.0.0');

    const cycles = graph.getCycles();
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('buildGraph', () => {
  it('builds a graph from resolved packages', () => {
    const packages = [
      makePkg('express', '4.18.0', 'MIT', ['accepts']),
      makePkg('accepts', '1.3.8', 'MIT'),
    ];

    const graph = buildGraph(packages, 'my-app', '1.0.0');

    expect(graph.size).toBeGreaterThanOrEqual(3); // root + 2 packages
    expect(graph.getNode(pkgKey('express', '4.18.0'))).toBeDefined();
    expect(graph.getNode(pkgKey('accepts', '1.3.8'))).toBeDefined();
  });

  it('computes depths correctly', () => {
    const packages = [
      makePkg('a', '1.0.0', 'MIT', ['b']),
      makePkg('b', '1.0.0', 'MIT', ['c']),
      makePkg('c', '1.0.0', 'MIT'),
    ];

    const graph = buildGraph(packages, 'root', '1.0.0');

    // All packages are connected to root, so direct deps are depth 1
    // buildGraph connects root → all packages as direct deps
    const nodeA = graph.getNode(pkgKey('a', '1.0.0'));
    expect(nodeA?.depth).toBe(1);

    // b is also connected to root directly (min depth wins)
    const nodeB = graph.getNode(pkgKey('b', '1.0.0'));
    expect(nodeB?.depth).toBe(1);

    // c is also reachable from root directly
    const nodeC = graph.getNode(pkgKey('c', '1.0.0'));
    expect(nodeC?.depth).toBe(1);
  });
});
