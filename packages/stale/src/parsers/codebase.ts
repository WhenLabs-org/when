import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import type { CodebaseFacts, CodeEnvVar, CodeRoute, ConfigPort } from '../types.js';
import type { StaleConfig } from '../types.js';
import { parsePackageJson, parseDockerCompose, parseVersionFiles } from './config.js';

const JS_ENV_REGEX = /process\.env\.([A-Z][A-Z0-9_]+)/g;
const JS_ENV_BRACKET_REGEX = /process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g;
const PY_ENV_REGEX = /os\.(?:environ(?:\.get)?|getenv)\(?['"]([A-Z][A-Z0-9_]+)['"]\)?/g;
const DOTENV_REGEX = /^([A-Z][A-Z0-9_]+)\s*=/gm;

const MAKEFILE_TARGET_REGEX = /^([a-zA-Z_][\w.-]*)\s*:/gm;

async function extractEnvVars(projectPath: string): Promise<CodeEnvVar[]> {
  const envVars: CodeEnvVar[] = [];
  const seen = new Map<string, CodeEnvVar>();

  // Scan source files
  const sourceFiles = await fg(
    ['**/*.{ts,tsx,js,jsx,mjs,cjs,py,rb,go}'],
    { cwd: projectPath, ignore: ['node_modules/**', 'dist/**', '.git/**', 'coverage/**'] },
  );

  for (const file of sourceFiles) {
    try {
      const content = await readFile(join(projectPath, file), 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const regexes = file.endsWith('.py') ? [PY_ENV_REGEX] : [JS_ENV_REGEX, JS_ENV_BRACKET_REGEX];

        for (const regex of regexes) {
          regex.lastIndex = 0;
          let match;
          while ((match = regex.exec(line)) !== null) {
            const name = match[1];
            if (!seen.has(name)) {
              const envVar = { name, file, line: i + 1 };
              seen.set(name, envVar);
              envVars.push(envVar);
            }
          }
        }
      }
    } catch {
      continue;
    }
  }

  // Scan .env.example / .env.sample
  for (const envFile of ['.env.example', '.env.sample']) {
    try {
      const content = await readFile(join(projectPath, envFile), 'utf-8');
      let match;
      DOTENV_REGEX.lastIndex = 0;
      while ((match = DOTENV_REGEX.exec(content)) !== null) {
        const name = match[1];
        if (!seen.has(name)) {
          const envVar = { name, file: envFile, line: content.slice(0, match.index).split('\n').length };
          seen.set(name, envVar);
          envVars.push(envVar);
        }
      }
    } catch {
      continue;
    }
  }

  return envVars;
}

async function extractRoutes(projectPath: string): Promise<CodeRoute[]> {
  const routes: CodeRoute[] = [];
  const sourceFiles = await fg(
    ['**/*.{ts,tsx,js,jsx,mjs,cjs,py}'],
    { cwd: projectPath, ignore: ['node_modules/**', 'dist/**', '.git/**', 'coverage/**', '**/*.test.*', '**/*.spec.*'] },
  );

  for (const file of sourceFiles) {
    try {
      const content = await readFile(join(projectPath, file), 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Express/Fastify/Koa/Hono pattern
        const routeRegex = /(?:app|router|server|fastify|hono)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`](\/[^'"`]*?)['"`]/gi;
        let match;
        while ((match = routeRegex.exec(line)) !== null) {
          const framework = content.includes('fastify') ? 'fastify'
            : content.includes('express') ? 'express'
            : content.includes('koa') ? 'koa'
            : content.includes('hono') ? 'hono'
            : 'unknown';

          routes.push({
            method: match[1].toUpperCase(),
            path: match[2],
            file,
            line: i + 1,
            framework: framework as CodeRoute['framework'],
          });
        }

        // Flask pattern
        const flaskRegex = /@(?:app|blueprint|bp)\.route\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/gi;
        while ((match = flaskRegex.exec(line)) !== null) {
          const path = match[1];
          const methods = match[2]
            ? match[2].replace(/['"\s]/g, '').split(',')
            : ['GET'];
          for (const method of methods) {
            routes.push({ method: method.toUpperCase(), path, file, line: i + 1, framework: 'flask' });
          }
        }
      }
    } catch {
      continue;
    }
  }

  return routes;
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

const SYMBOL_REGEX = /(?:function|const|let|var|class|type|interface|enum|export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum))\s+([a-zA-Z_$][\w$]*)/g;
const METHOD_REGEX = /^\s*(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\(/gm;

async function extractSourceSymbols(projectPath: string): Promise<Set<string>> {
  const symbols = new Set<string>();

  const sourceFiles = await fg(
    ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    { cwd: projectPath, ignore: ['node_modules/**', 'dist/**', '.git/**', 'coverage/**'] },
  );

  for (const file of sourceFiles) {
    try {
      const content = await readFile(join(projectPath, file), 'utf-8');

      SYMBOL_REGEX.lastIndex = 0;
      let match;
      while ((match = SYMBOL_REGEX.exec(content)) !== null) {
        symbols.add(match[1]);
      }

      METHOD_REGEX.lastIndex = 0;
      while ((match = METHOD_REGEX.exec(content)) !== null) {
        const name = match[1];
        // Skip common keywords that look like methods
        if (!['if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'new', 'delete', 'typeof', 'void', 'import', 'export', 'require'].includes(name)) {
          symbols.add(name);
        }
      }
    } catch {
      continue;
    }
  }

  return symbols;
}

export async function parseCodebase(projectPath: string, config: StaleConfig): Promise<CodebaseFacts> {
  const allFiles = await fg(['**/*'], {
    cwd: projectPath,
    ignore: ['node_modules/**', 'dist/**', '.git/**', 'coverage/**', ...(config.ignore || [])],
    dot: true,
  });

  const existingFiles = new Set(allFiles);
  const packageJson = await parsePackageJson(projectPath);
  const dockerCompose = await parseDockerCompose(projectPath);
  const versionFiles = await parseVersionFiles(projectPath);
  const envVarsUsed = await extractEnvVars(projectPath);
  const routes = await extractRoutes(projectPath);
  const makeTargets = await extractMakeTargets(projectPath);
  const configPorts = await extractConfigPorts(projectPath);
  const needSymbols = config.checks.commentStaleness;
  const sourceSymbols = needSymbols ? await extractSourceSymbols(projectPath) : new Set<string>();

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
  };
}
