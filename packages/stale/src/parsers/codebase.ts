import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import type { CodebaseFacts, CodeEnvVar, CodeRoute, ConfigPort } from '../types.js';
import type { StaleConfig } from '../types.js';
import { parsePackageJson, parseDockerCompose, parseVersionFiles } from './config.js';
import { extractFromTsSource, isTsLikeFile, type TsFileFacts } from './ast/ts-extractor.js';
import { loadCache, saveCache, type FactCache, type FileFactCacheEntry } from '../utils/cache.js';
import { detectWorkspaces } from './workspaces.js';
import type { WorkspaceFact } from '../types.js';

const DOTENV_REGEX = /^([A-Z][A-Z0-9_]+)\s*=/gm;

const MAKEFILE_TARGET_REGEX = /^([a-zA-Z_][\w.-]*)\s*:/gm;

// Handles all common Python env-var access patterns:
//   os.environ["FOO"], os.environ.get("FOO"), os.getenv("FOO"),
//   environ["FOO"] (after `from os import environ`),
//   getenv("FOO")  (after `from os import getenv`).
// Strings inside comments (# ...) are stripped before matching so we don't
// flag referenced names in doc strings on the same physical line.
const PY_ENV_PATTERNS: RegExp[] = [
  /(?:os\.)?environ(?:\.get)?\s*\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /(?:os\.)?environ\s*\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g,
  /(?:os\.)?getenv\s*\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
];

interface PerFileFacts {
  envVars: CodeEnvVar[];
  routes: CodeRoute[];
  symbols: string[];
}

const EMPTY_FACTS: PerFileFacts = { envVars: [], routes: [], symbols: [] };

function stripPythonComment(line: string): string {
  // Respects single- and double-quoted strings; anything after a bare `#` is
  // treated as a comment and removed.
  let inStr: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '#') return line.slice(0, i);
  }
  return line;
}

function extractPyFacts(file: string, content: string): PerFileFacts {
  const envVars: CodeEnvVar[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = stripPythonComment(lines[i]);
    for (const pattern of PY_ENV_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const key = `${match[1]}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        envVars.push({ name: match[1], file, line: i + 1 });
      }
    }
  }
  return { envVars, routes: [], symbols: [] };
}

function extractPyRoutes(file: string, content: string): CodeRoute[] {
  const routes: CodeRoute[] = [];
  const flaskRegex = /@(?:app|blueprint|bp)\.route\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/g;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    flaskRegex.lastIndex = 0;
    let match;
    while ((match = flaskRegex.exec(line)) !== null) {
      const path = match[1];
      const methods = match[2] ? match[2].replace(/['"\s]/g, '').split(',') : ['GET'];
      for (const method of methods) {
        routes.push({ method: method.toUpperCase(), path, file, line: i + 1, framework: 'flask' });
      }
    }
  }
  return routes;
}

async function extractFileFacts(file: string, content: string): Promise<PerFileFacts> {
  if (isTsLikeFile(file)) {
    const r: TsFileFacts = extractFromTsSource(file, content);
    return { envVars: r.envVars, routes: r.routes, symbols: r.symbols };
  }
  if (file.endsWith('.py')) {
    const envFacts = extractPyFacts(file, content);
    const routes = extractPyRoutes(file, content);
    return { ...envFacts, routes };
  }
  return EMPTY_FACTS;
}

async function extractSourceFacts(
  projectPath: string,
  config: StaleConfig,
  cache: FactCache | null,
): Promise<{ perFile: Map<string, PerFileFacts>; cacheEntries: Map<string, FileFactCacheEntry> }> {
  const sourceFiles = await fg(
    ['**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,py}'],
    {
      cwd: projectPath,
      ignore: [
        '**/node_modules/**', '**/dist/**', '**/build/**', '.git/**', '**/coverage/**',
        '**/*.test.*', '**/*.spec.*',
        ...(config.ignore ?? []),
      ],
    },
  );

  const perFile = new Map<string, PerFileFacts>();
  const cacheEntries = new Map<string, FileFactCacheEntry>();

  await Promise.all(sourceFiles.map(async (file) => {
    try {
      const abs = join(projectPath, file);
      const st = await stat(abs);
      const mtime = st.mtimeMs;
      const size = st.size;

      const cached = cache?.files[file];
      if (cached && cached.mtimeMs === mtime && cached.size === size) {
        perFile.set(file, cached.facts);
        cacheEntries.set(file, cached);
        return;
      }

      const content = await readFile(abs, 'utf-8');
      const facts = await extractFileFacts(file, content);
      perFile.set(file, facts);
      cacheEntries.set(file, { mtimeMs: mtime, size, facts });
    } catch {
      // skip unreadable files
    }
  }));

  return { perFile, cacheEntries };
}

async function extractDotenvVars(projectPath: string): Promise<CodeEnvVar[]> {
  const out: CodeEnvVar[] = [];
  const seen = new Set<string>();
  for (const envFile of ['.env.example', '.env.sample']) {
    try {
      const content = await readFile(join(projectPath, envFile), 'utf-8');
      DOTENV_REGEX.lastIndex = 0;
      let match;
      while ((match = DOTENV_REGEX.exec(content)) !== null) {
        const name = match[1];
        if (!seen.has(name)) {
          seen.add(name);
          out.push({ name, file: envFile, line: content.slice(0, match.index).split('\n').length });
        }
      }
    } catch {
      continue;
    }
  }
  return out;
}

async function extractMakeTargets(projectPath: string): Promise<string[]> {
  try {
    const content = await readFile(join(projectPath, 'Makefile'), 'utf-8');
    const targets: string[] = [];
    let match;
    MAKEFILE_TARGET_REGEX.lastIndex = 0;
    while ((match = MAKEFILE_TARGET_REGEX.exec(content)) !== null) {
      targets.push(match[1]);
    }
    return targets;
  } catch {
    return [];
  }
}

async function extractConfigPorts(projectPath: string): Promise<ConfigPort[]> {
  const ports: ConfigPort[] = [];
  const seen = new Set<number>();

  // Check .env files
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.example', '.env.sample'];
  for (const envFile of envFiles) {
    try {
      const content = await readFile(join(projectPath, envFile), 'utf-8');
      const portMatch = content.match(/^PORT\s*=\s*(\d+)/m);
      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        if (!seen.has(port)) {
          seen.add(port);
          ports.push({ port, source: envFile });
        }
      }
      // Also check for specific port vars like API_PORT, SERVER_PORT
      for (const match of content.matchAll(/^([A-Z_]*PORT[A-Z_]*)\s*=\s*(\d+)/gm)) {
        const port = parseInt(match[2], 10);
        if (!seen.has(port)) {
          seen.add(port);
          ports.push({ port, source: `${envFile} (${match[1]})` });
        }
      }
    } catch {
      continue;
    }
  }

  // Check package.json scripts for port flags
  try {
    const content = await readFile(join(projectPath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    if (pkg.scripts) {
      for (const [name, script] of Object.entries(pkg.scripts)) {
        const portMatch = (script as string).match(/--port\s+(\d+)|--port=(\d+)|-p\s+(\d+)/);
        if (portMatch) {
          const port = parseInt(portMatch[1] ?? portMatch[2] ?? portMatch[3], 10);
          if (!seen.has(port)) {
            seen.add(port);
            ports.push({ port, source: `package.json script "${name}"` });
          }
        }
      }
    }
  } catch {}

  // Check docker-compose for port mappings
  const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  for (const composeFile of composeFiles) {
    try {
      const content = await readFile(join(projectPath, composeFile), 'utf-8');
      // Match port mappings like "3001:3000" or "- 8080:80"
      for (const match of content.matchAll(/['"]?(\d{3,5}):(\d{3,5})['"]?/g)) {
        const hostPort = parseInt(match[1], 10);
        if (!seen.has(hostPort)) {
          seen.add(hostPort);
          ports.push({ port: hostPort, source: composeFile });
        }
      }
    } catch {
      continue;
    }
  }

  return ports;
}

export async function parseCodebase(projectPath: string, config: StaleConfig): Promise<CodebaseFacts> {
  const allFiles = await fg(['**/*'], {
    cwd: projectPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '.git/**', '**/coverage/**', ...(config.ignore || [])],
    dot: true,
  });

  const existingFiles = new Set(allFiles);
  const cache = await loadCache(projectPath, config);

  const [packageJson, dockerCompose, versionFiles, makeTargets, configPorts, dotenvVars, sourceResult, wsLayout] =
    await Promise.all([
      parsePackageJson(projectPath),
      parseDockerCompose(projectPath),
      parseVersionFiles(projectPath),
      extractMakeTargets(projectPath),
      extractConfigPorts(projectPath),
      extractDotenvVars(projectPath),
      extractSourceFacts(projectPath, config, cache),
      detectWorkspaces(projectPath),
    ]);

  const workspaces: WorkspaceFact[] = wsLayout.workspaces.map((w) => {
    const pkg = w.packageJson as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      engines?: Record<string, string>;
    };
    return {
      name: w.name,
      relativePath: w.relativePath,
      scripts: pkg.scripts ?? {},
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {},
      engines: pkg.engines,
    };
  });

  const envVarsSeen = new Set<string>();
  const envVarsUsed: CodeEnvVar[] = [];
  const routes: CodeRoute[] = [];
  const sourceSymbols = new Set<string>();

  for (const [, facts] of sourceResult.perFile) {
    for (const ev of facts.envVars) {
      if (!envVarsSeen.has(ev.name)) {
        envVarsSeen.add(ev.name);
        envVarsUsed.push(ev);
      }
    }
    for (const r of facts.routes) routes.push(r);
    if (config.checks.commentStaleness) {
      for (const s of facts.symbols) sourceSymbols.add(s);
    }
  }
  for (const ev of dotenvVars) {
    if (!envVarsSeen.has(ev.name)) {
      envVarsSeen.add(ev.name);
      envVarsUsed.push(ev);
    }
  }

  await saveCache(projectPath, config, sourceResult.cacheEntries);

  const nodeVersion = { ...versionFiles };
  if (packageJson?.engines?.node) {
    nodeVersion.fromEngines = packageJson.engines.node;
  }

  return {
    packageJson: packageJson ?? undefined,
    scripts: packageJson?.scripts ?? {},
    makeTargets,
    envVarsUsed,
    routes,
    existingFiles,
    dockerCompose: dockerCompose ?? undefined,
    nodeVersion,
    dependencies: packageJson?.dependencies ?? {},
    devDependencies: packageJson?.devDependencies ?? {},
    configPorts,
    sourceSymbols,
    workspaces,
  };
}
