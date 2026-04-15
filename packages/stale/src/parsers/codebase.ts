import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import type { CodebaseFacts, CodeEnvVar, CodeRoute } from '../types.js';
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
  };
}
