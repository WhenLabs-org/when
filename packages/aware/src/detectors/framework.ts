import * as path from "node:path";
import type { StackItem, PackageJson } from "../types.js";
import { loadProjectDeps, parseToml, getDepVersion, cleanVersion } from "../utils/parsers.js";
import type { LockfileVersionMap } from "../core/lockfile.js";
import { readFile, fileExists } from "../utils/fs.js";
import { hasDep } from "./utils.js";

export async function detectFramework(projectRoot: string): Promise<StackItem | null> {
  // 1. Check package.json deps — with lockfile-aware version resolution so
  //    Phase 2's version-range fragment selection sees "15.1.2", not "^15".
  const { pkg, lockfile } = await loadProjectDeps(projectRoot);
  if (pkg) {
    const result = await detectJsFramework(projectRoot, pkg, lockfile);
    if (result) return result;
  }

  // 2. Cargo.toml
  const cargo = await parseToml(path.join(projectRoot, "Cargo.toml"));
  if (cargo) {
    return detectRustFramework(cargo);
  }

  // 3. Python
  const pyResult = await detectPythonFramework(projectRoot);
  if (pyResult) return pyResult;

  // 4. Go
  const goResult = await detectGoFramework(projectRoot);
  if (goResult) return goResult;

  return null;
}

async function detectJsFramework(
  projectRoot: string,
  pkg: PackageJson,
  lockfile: LockfileVersionMap,
): Promise<StackItem | null> {
  // Next.js
  if (hasDep(pkg, "next")) {
    const hasAppDir =
      (await fileExists(path.join(projectRoot, "src", "app"))) ||
      (await fileExists(path.join(projectRoot, "app")));
    return {
      name: "nextjs",
      version: getDepVersion(pkg, "next", lockfile),
      variant: hasAppDir ? "app-router" : "pages-router",
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Remix
  if (hasDep(pkg, "@remix-run/node") || hasDep(pkg, "@remix-run/react") || hasDep(pkg, "@remix-run/dev")) {
    const remixDep = "@remix-run/react";
    return {
      name: "remix",
      version:
        getDepVersion(pkg, remixDep, lockfile) ??
        getDepVersion(pkg, "@remix-run/node", lockfile) ??
        getDepVersion(pkg, "@remix-run/dev", lockfile),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Nuxt
  if (hasDep(pkg, "nuxt")) {
    return {
      name: "nuxt",
      version: getDepVersion(pkg, "nuxt", lockfile),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Astro
  if (hasDep(pkg, "astro")) {
    return {
      name: "astro",
      version: getDepVersion(pkg, "astro", lockfile),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // SvelteKit or Svelte
  if (hasDep(pkg, "@sveltejs/kit")) {
    return {
      name: "sveltekit",
      version: getDepVersion(pkg, "@sveltejs/kit", lockfile),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }
  if (hasDep(pkg, "svelte")) {
    return {
      name: "svelte",
      version: getDepVersion(pkg, "svelte", lockfile),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Fastify
  if (hasDep(pkg, "fastify")) {
    return {
      name: "fastify",
      version: getDepVersion(pkg, "fastify", lockfile),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Express
  if (hasDep(pkg, "express")) {
    return {
      name: "express",
      version: getDepVersion(pkg, "express", lockfile),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Angular
  if (hasDep(pkg, "@angular/core")) {
    return {
      name: "angular",
      version: getDepVersion(pkg, "@angular/core", lockfile),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // NestJS
  if (hasDep(pkg, "@nestjs/core")) {
    return {
      name: "nestjs",
      version: getDepVersion(pkg, "@nestjs/core", lockfile),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Hono
  if (hasDep(pkg, "hono")) {
    return {
      name: "hono",
      version: getDepVersion(pkg, "hono", lockfile),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Vue (standalone, not Nuxt — Nuxt is caught above)
  if (hasDep(pkg, "vue") && !hasDep(pkg, "nuxt") && !hasDep(pkg, "vite")) {
    return {
      name: "vue",
      version: getDepVersion(pkg, "vue", lockfile),
      variant: null,
      confidence: 0.80,
      detectedFrom: "package.json",
    };
  }

  // Vite + React
  if (hasDep(pkg, "vite") && hasDep(pkg, "react")) {
    return {
      name: "vite-react",
      version: getDepVersion(pkg, "vite", lockfile),
      variant: null,
      confidence: 0.85,
      detectedFrom: "package.json",
    };
  }

  // Vite + Vue
  if (hasDep(pkg, "vite") && hasDep(pkg, "vue")) {
    return {
      name: "vite-vue",
      version: getDepVersion(pkg, "vite", lockfile),
      variant: null,
      confidence: 0.85,
      detectedFrom: "package.json",
    };
  }

  // Vite alone
  if (hasDep(pkg, "vite")) {
    return {
      name: "vite",
      version: getDepVersion(pkg, "vite", lockfile),
      variant: null,
      confidence: 0.70,
      detectedFrom: "package.json",
    };
  }

  // React alone
  if (hasDep(pkg, "react")) {
    return {
      name: "react",
      version: getDepVersion(pkg, "react", lockfile),
      variant: null,
      confidence: 0.60,
      detectedFrom: "package.json",
    };
  }

  return null;
}

function detectRustFramework(cargo: Record<string, unknown>): StackItem | null {
  const deps = cargo.dependencies as Record<string, unknown> | undefined;
  if (!deps) {
    return { name: "rust", version: null, variant: null, confidence: 0.70, detectedFrom: "Cargo.toml" };
  }

  // CLI tools
  if (deps.clap || deps.structopt) {
    return { name: "rust", version: null, variant: "cli", confidence: 0.90, detectedFrom: "Cargo.toml" };
  }

  // Web frameworks
  for (const fw of ["actix-web", "axum", "rocket"]) {
    if (deps[fw]) {
      return { name: "rust", version: null, variant: `web-${fw}`, confidence: 0.90, detectedFrom: "Cargo.toml" };
    }
  }

  return { name: "rust", version: null, variant: null, confidence: 0.70, detectedFrom: "Cargo.toml" };
}

async function detectPythonFramework(projectRoot: string): Promise<StackItem | null> {
  // Check requirements.txt
  const reqContent = await readFile(path.join(projectRoot, "requirements.txt"));
  if (reqContent) {
    const lower = reqContent.toLowerCase();
    if (lower.includes("fastapi")) {
      return { name: "fastapi", version: null, variant: null, confidence: 0.90, detectedFrom: "requirements.txt" };
    }
    if (lower.includes("django")) {
      return { name: "django", version: null, variant: null, confidence: 0.90, detectedFrom: "requirements.txt" };
    }
    if (lower.includes("flask")) {
      return { name: "flask", version: null, variant: null, confidence: 0.90, detectedFrom: "requirements.txt" };
    }
  }

  // Check pyproject.toml
  const pyproject = await parseToml(path.join(projectRoot, "pyproject.toml"));
  if (pyproject) {
    const depsStr = JSON.stringify(pyproject).toLowerCase();
    if (depsStr.includes("fastapi")) {
      return { name: "fastapi", version: null, variant: null, confidence: 0.90, detectedFrom: "pyproject.toml" };
    }
    if (depsStr.includes("django")) {
      return { name: "django", version: null, variant: null, confidence: 0.90, detectedFrom: "pyproject.toml" };
    }
    if (depsStr.includes("flask")) {
      return { name: "flask", version: null, variant: null, confidence: 0.90, detectedFrom: "pyproject.toml" };
    }
  }

  return null;
}

async function detectGoFramework(projectRoot: string): Promise<StackItem | null> {
  const goMod = await readFile(path.join(projectRoot, "go.mod"));
  if (!goMod) return null;

  if (goMod.includes("github.com/gin-gonic/gin")) {
    return { name: "go", version: null, variant: "gin", confidence: 0.85, detectedFrom: "go.mod" };
  }

  if (goMod.includes("github.com/labstack/echo")) {
    return { name: "go", version: null, variant: "echo", confidence: 0.85, detectedFrom: "go.mod" };
  }

  if (goMod.includes("github.com/gofiber/fiber")) {
    return { name: "go", version: null, variant: "fiber", confidence: 0.85, detectedFrom: "go.mod" };
  }

  // Generic Go project
  return { name: "go", version: null, variant: null, confidence: 0.70, detectedFrom: "go.mod" };
}
