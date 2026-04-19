import type { CodebaseFacts, WorkspaceFact } from '../types.js';

export function workspaceForDoc(docPath: string, workspaces: WorkspaceFact[]): WorkspaceFact | null {
  let best: WorkspaceFact | null = null;
  for (const ws of workspaces) {
    if (ws.relativePath === '.') continue;
    const prefix = ws.relativePath.endsWith('/') ? ws.relativePath : ws.relativePath + '/';
    if (docPath === ws.relativePath || docPath.startsWith(prefix)) {
      if (!best || ws.relativePath.length > best.relativePath.length) {
        best = ws;
      }
    }
  }
  return best;
}

export function scriptsFor(docPath: string, codebase: CodebaseFacts): Record<string, string> {
  const ws = workspaceForDoc(docPath, codebase.workspaces);
  if (ws && Object.keys(ws.scripts).length > 0) {
    return { ...codebase.scripts, ...ws.scripts };
  }
  return codebase.scripts;
}

export function depsFor(docPath: string, codebase: CodebaseFacts): { deps: Record<string, string>; devDeps: Record<string, string> } {
  const ws = workspaceForDoc(docPath, codebase.workspaces);
  if (ws) {
    return {
      deps: { ...codebase.dependencies, ...ws.dependencies },
      devDeps: { ...codebase.devDependencies, ...ws.devDependencies },
    };
  }
  return { deps: codebase.dependencies, devDeps: codebase.devDependencies };
}

/**
 * Returns the Node.js version string and its source for the workspace
 * that owns `docPath`, falling back to the root `codebase.nodeVersion`.
 * Workspace `engines.node` wins over root when present.
 */
export function nodeVersionFor(
  docPath: string,
  codebase: CodebaseFacts,
): { version: string; source: string } | null {
  const ws = workspaceForDoc(docPath, codebase.workspaces);
  const wsNode = ws?.engines?.node;
  if (wsNode) {
    return { version: wsNode, source: `${ws!.relativePath}/package.json engines` };
  }
  const nv = codebase.nodeVersion;
  if (!nv) return null;
  if (nv.fromEngines) return { version: nv.fromEngines, source: 'package.json engines' };
  if (nv.fromNvmrc) return { version: nv.fromNvmrc, source: '.nvmrc' };
  if (nv.fromNodeVersion) return { version: nv.fromNodeVersion, source: '.node-version' };
  if (nv.fromDockerfile) return { version: nv.fromDockerfile, source: 'Dockerfile' };
  return null;
}

export function resolveFileForDoc(
  docPath: string,
  referencedPath: string,
  existingFiles: Set<string>,
  workspaces: WorkspaceFact[],
): string | null {
  const normalized = referencedPath.replace(/^\.\//, '');
  if (existingFiles.has(normalized)) return normalized;
  const ws = workspaceForDoc(docPath, workspaces);
  if (ws) {
    const prefix = ws.relativePath.endsWith('/') ? ws.relativePath : ws.relativePath + '/';
    const scoped = prefix + normalized;
    if (existingFiles.has(scoped)) return scoped;
  }
  return null;
}
