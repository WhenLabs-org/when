import * as path from "node:path";
import { detectStack, stackToConfig } from "./detectors/index.js";
import { resolveFragments } from "./fragments/index.js";
import { generateAll } from "./generators/index.js";
import { createDefaultConfig, loadConfig } from "./utils/config.js";
import { parsePackageJson } from "./utils/parsers.js";
import { fileExists, listDir } from "./utils/fs.js";
import { extractConventions } from "./conventions/extractor.js";
import { loadPlugins } from "./plugins/loader.js";
import { log } from "./utils/logger.js";
import type {
  AwareConfig,
  ConventionsConfig,
  DetectedStack,
  ExtractedConventions,
  Fragment,
  GeneratorResult,
  NamingConventions,
  StackConfig,
  TargetsConfig,
} from "./types.js";

// Phase 2 red flag (carried forward): DetectedStack is loose — it's a big
// union of per-category StackItem shapes with no single canonical rollup.
// We keep the existing shape as the source of truth and stash the full
// detection payload in ScanResult.raw so no information is lost. Core
// Findings are only the actionable deltas (missing/stale context files).
export interface GeneratedFile {
  path: string;
  content: string;
  sections: number;
  target: GeneratorResult["target"];
}

export interface ScanOptions {
  projectRoot?: string;
  targets?: TargetsConfig;
  detect?: boolean;
  /**
   * Opt out of Phase 3 source-code convention extraction. Default true.
   * Kept opt-out rather than opt-in because extraction is core to the
   * tool's value proposition; users who don't want code scanned (or
   * have non-standard layouts) can disable it explicitly.
   */
  extractConventions?: boolean;
}

export interface ScanOutput {
  projectRoot: string;
  projectName: string;
  stack: DetectedStack;
  stackConfig: StackConfig;
  config: AwareConfig;
  fragments: Fragment[];
  generatedFiles: GeneratedFile[];
}

const EMPTY_STACK: DetectedStack = {
  framework: null,
  language: null,
  styling: null,
  orm: null,
  database: null,
  testing: [],
  linting: [],
  packageManager: null,
  monorepo: null,
  deployment: null,
  auth: null,
  apiStyle: null,
  stateManagement: null,
  cicd: null,
  bundler: null,
};

const DEFAULT_TARGETS: TargetsConfig = {
  claude: true,
  cursor: true,
  copilot: true,
  agents: true,
};

export async function scan(opts: ScanOptions = {}): Promise<ScanOutput> {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const targets = opts.targets ?? DEFAULT_TARGETS;
  const shouldDetect = opts.detect !== false;

  const stack: DetectedStack = shouldDetect
    ? await detectStack(projectRoot)
    : { ...EMPTY_STACK };

  const stackConfig = stackToConfig(stack);
  const pkg = await parsePackageJson(projectRoot);
  const projectName = pkg?.name ?? path.basename(projectRoot);
  const config = createDefaultConfig(projectName, stackConfig, targets);

  if (pkg?.description) {
    config.project.description = pkg.description;
  }
  config.project.architecture = generateArchitectureString(stackConfig);
  config.structure = await detectStructure(projectRoot);

  // Convention resolution (Phase 3): start from framework defaults, then
  // override high-confidence extracted values. The extracted payload is
  // always saved under `conventions.extracted` so `aware sync` can keep
  // it current without touching user-edited sibling fields.
  //
  // Three opt-out paths, all honored:
  //   1. `opts.extractConventions === false` — library caller opts out
  //      programmatically.
  //   2. Existing `.aware.json` has `conventions.extract: false` — user
  //      pre-seeded a config before running `init --force`.
  //   3. Neither — the default. Extraction runs.
  const defaults = generateConventions(stack);
  const existingConfig = await loadExistingConfigSafely(projectRoot);

  // Phase 5: load plugins declared in an existing .aware.json BEFORE
  // fragment resolution runs. This means a pre-seeded config can
  // register plugin fragments for the very first `aware init`.
  // Plugin load failures don't abort scan — they just surface as
  // warnings and the core fragments still apply.
  if (existingConfig?.plugins && existingConfig.plugins.length > 0) {
    await loadPlugins({
      projectRoot,
      pluginSpecifiers: existingConfig.plugins,
    });
  }

  const shouldExtract = await shouldExtractConventions(
    opts,
    existingConfig,
  );
  if (shouldExtract) {
    log.dim(
      `  Sampling source files for convention extraction… (opt out: set \`conventions.extract: false\` in .aware.json)`,
    );
    const extracted = await extractConventions(projectRoot);
    config.conventions = mergeConventionsForInit(defaults, extracted);
  } else {
    config.conventions = defaults;
  }
  // Carry the opt-out flag forward so the user's choice survives a
  // re-init. Without this, `init --force` would silently re-enable
  // extraction on the next sync.
  if (existingConfig?.conventions?.extract === false) {
    config.conventions.extract = false;
  }

  // Carry plugins forward. Otherwise `aware init --force` on a
  // pre-seeded `.aware.json` with `plugins: [...]` would load the
  // plugins once (so generation benefits), then save a new config
  // WITHOUT the plugins field — the next sync wouldn't know to load
  // them. Plugins are opt-in via user edit, and a re-init should
  // preserve that choice.
  if (existingConfig?.plugins && existingConfig.plugins.length > 0) {
    config.plugins = [...existingConfig.plugins];
  }

  // Carry packages (monorepo root declaration) forward for the same
  // reason — init of a monorepo root shouldn't silently drop the
  // workspace membership list.
  if (existingConfig?.packages && existingConfig.packages.length > 0) {
    config.packages = [...existingConfig.packages];
  }

  const fragments = resolveFragments(stack, config);
  const results = generateAll(stack, config, fragments);

  const generatedFiles: GeneratedFile[] = results.map((r) => ({
    path: r.filePath,
    content: r.content,
    sections: r.sections,
    target: r.target,
  }));

  return {
    projectRoot,
    projectName,
    stack,
    stackConfig,
    config,
    fragments,
    generatedFiles,
  };
}

export function generateArchitectureString(stack: StackConfig): string {
  const parts: string[] = [];

  if (stack.framework) {
    const name = stack.framework.split("@")[0] ?? stack.framework;
    const variant = stack.framework.includes(":") ? stack.framework.split(":")[1] : null;
    const prettyName = FRAMEWORK_NAMES[name] ?? name;
    parts.push(variant ? `${prettyName} (${formatVariant(variant)})` : prettyName);
  }

  if (stack.apiStyle) {
    const name = stack.apiStyle.split("@")[0] ?? stack.apiStyle;
    parts.push(`${API_NAMES[name] ?? name} API layer`);
  }

  if (stack.orm) {
    const name = stack.orm.split("@")[0] ?? stack.orm;
    parts.push(ORM_NAMES[name] ?? name);
  }

  if (stack.database) {
    const name = stack.database.split("@")[0] ?? stack.database;
    parts.push(DB_NAMES[name] ?? name);
  }

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return parts.slice(0, -1).join(" with ") + " on " + parts[parts.length - 1]!;
}

const FRAMEWORK_NAMES: Record<string, string> = {
  nextjs: "Next.js", remix: "Remix", nuxt: "Nuxt", astro: "Astro",
  sveltekit: "SvelteKit", svelte: "Svelte", fastify: "Fastify", express: "Express",
  hono: "Hono", "vite-react": "Vite + React", "vite-vue": "Vite + Vue",
  fastapi: "FastAPI", django: "Django", flask: "Flask", rust: "Rust",
  angular: "Angular", nestjs: "NestJS", vue: "Vue", go: "Go",
};

const API_NAMES: Record<string, string> = {
  trpc: "tRPC", graphql: "GraphQL", rest: "REST", openapi: "OpenAPI",
};

const ORM_NAMES: Record<string, string> = {
  drizzle: "Drizzle ORM", prisma: "Prisma", typeorm: "TypeORM",
  sqlalchemy: "SQLAlchemy", mongoose: "Mongoose", sequelize: "Sequelize", kysely: "Kysely",
};

const DB_NAMES: Record<string, string> = {
  postgres: "PostgreSQL", mysql: "MySQL", mongodb: "MongoDB",
  sqlite: "SQLite", redis: "Redis",
};

function formatVariant(variant: string): string {
  return variant.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const KNOWN_DIRS: Record<string, string> = {
  "src/app/": "Next.js App Router pages and layouts",
  "src/pages/": "Page components and routes",
  "src/components/": "Reusable UI components",
  "src/lib/": "Shared utilities, configs, and type definitions",
  "src/utils/": "Utility functions and helpers",
  "src/hooks/": "Custom React hooks",
  "src/server/": "Server-side code, API routers, and business logic",
  "src/db/": "Database schema, queries, and migrations",
  "src/styles/": "Global styles and CSS",
  "src/types/": "Shared TypeScript type definitions",
  "src/store/": "State management stores",
  "src/services/": "External service integrations and API clients",
  "src/middleware/": "Middleware functions",
  "src/config/": "Configuration files and constants",
  "src/routes/": "Route definitions and handlers",
  "src/models/": "Data models",
  "src/controllers/": "Request handlers and controllers",
  "src/views/": "View templates",
  "src/api/": "API route handlers",
  "src/features/": "Feature-based modules",
  "src/layouts/": "Layout components",
  "src/context/": "React Context providers",
  "app/": "Next.js App Router pages and layouts",
  "pages/": "Page components and routes",
  "components/": "Reusable UI components",
  "lib/": "Shared utilities and helpers",
  "public/": "Static assets served at root",
  "prisma/": "Prisma schema and migrations",
  "tests/": "Test files",
  "test/": "Test files",
  "e2e/": "End-to-end tests",
  "scripts/": "Build and utility scripts",
  "docs/": "Documentation",
};

export async function detectStructure(projectRoot: string): Promise<Record<string, string>> {
  const structure: Record<string, string> = {};

  const topDirs = await listDir(projectRoot);
  for (const dir of topDirs) {
    const key = `${dir}/`;
    if (KNOWN_DIRS[key] && await fileExists(path.join(projectRoot, dir))) {
      structure[key] = KNOWN_DIRS[key];
    }
  }

  const srcDirs = await listDir(path.join(projectRoot, "src"));
  for (const dir of srcDirs) {
    const key = `src/${dir}/`;
    const fullPath = path.join(projectRoot, "src", dir);
    if (KNOWN_DIRS[key] && await fileExists(fullPath)) {
      structure[key] = KNOWN_DIRS[key];
    }
  }

  return structure;
}

/**
 * Decide whether to run convention extraction for a `scan()` call.
 * Covers all three opt-out paths so init behaves the same as sync.
 */
async function shouldExtractConventions(
  opts: ScanOptions,
  existing: AwareConfig | null,
): Promise<boolean> {
  if (opts.extractConventions === false) return false;
  if (existing?.conventions?.extract === false) return false;
  return true;
}

/**
 * Best-effort load of an existing `.aware.json` so scan() can honor
 * pre-seeded user preferences (notably `conventions.extract: false`).
 * Returns null on any failure — a corrupt or future-version file is
 * the init path's problem to surface, not ours.
 */
async function loadExistingConfigSafely(
  projectRoot: string,
): Promise<AwareConfig | null> {
  try {
    return await loadConfig(projectRoot);
  } catch {
    return null;
  }
}

/**
 * Merge framework-default conventions with extracted ones for a fresh
 * init. Extracted values win when present (the extractor already gated
 * on confidence >= 0.7 — below that it emits nothing). The full
 * `extracted` payload is stashed under `conventions.extracted` so
 * downstream `sync` can update it without touching user-facing fields.
 */
export function mergeConventionsForInit(
  defaults: ConventionsConfig,
  extracted: ExtractedConventions,
): ConventionsConfig {
  const merged: ConventionsConfig = { ...defaults };

  if (extracted.naming) {
    merged.naming = {
      ...(defaults.naming ?? {}),
      ...extracted.naming,
    } as NamingConventions;
  }
  if (extracted.tests) {
    merged.testing = {
      ...(defaults.testing ?? {}),
      ...extracted.tests,
    };
  }
  if (extracted.layout) {
    merged.components = {
      ...(defaults.components ?? {}),
      layout: extracted.layout.pattern ?? "mixed",
    };
  }

  merged.extracted = extracted;
  return merged;
}

export function generateConventions(stack: DetectedStack): ConventionsConfig {
  const conventions: ConventionsConfig = {};

  const lang = stack.language?.name;
  const fw = stack.framework?.name;

  if (lang === "typescript" || lang === "javascript") {
    conventions.naming = {
      files: "kebab-case",
      functions: "camelCase",
      constants: "UPPER_SNAKE_CASE",
    };

    if (fw === "nextjs" || fw === "vite-react" || fw === "remix" || fw === "astro") {
      conventions.naming.components = "PascalCase";
    }

    const importOrder = ["react", "next", "third-party", "local", "types"].filter((item) => {
      if (item === "react" && !fw?.includes("react") && fw !== "nextjs" && fw !== "remix") return false;
      if (item === "next" && fw !== "nextjs") return false;
      return true;
    });

    conventions.imports = {
      style: "named imports preferred",
      order: importOrder,
    };
  }

  if (lang === "python") {
    conventions.naming = {
      files: "snake_case",
      functions: "snake_case",
      constants: "UPPER_SNAKE_CASE",
    };
  }

  if (lang === "rust") {
    conventions.naming = {
      files: "snake_case",
      functions: "snake_case",
      constants: "UPPER_SNAKE_CASE",
    };
  }

  if (lang === "go") {
    conventions.naming = {
      files: "snake_case",
      functions: "PascalCase for exported, camelCase for unexported",
      constants: "PascalCase for exported, camelCase for unexported",
    };
  }

  if (stack.orm) {
    conventions.naming = conventions.naming ?? {};
    conventions.naming.database = "snake_case";
  }

  return conventions;
}
