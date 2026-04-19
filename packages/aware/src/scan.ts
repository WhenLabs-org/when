import * as path from "node:path";
import { detectStack, stackToConfig } from "./detectors/index.js";
import { resolveFragments } from "./fragments/index.js";
import { generateAll } from "./generators/index.js";
import { createDefaultConfig } from "./utils/config.js";
import { parsePackageJson } from "./utils/parsers.js";
import { fileExists, listDir } from "./utils/fs.js";
import type {
  AwareConfig,
  ConventionsConfig,
  DetectedStack,
  Fragment,
  GeneratorResult,
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
  config.conventions = generateConventions(stack);

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
