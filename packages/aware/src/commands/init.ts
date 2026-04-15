import * as path from "node:path";
import ora from "ora";
import { detectStack, stackToConfig, formatStackSummary } from "../detectors/index.js";
import { resolveFragments } from "../fragments/index.js";
import { generateAll } from "../generators/index.js";
import { createDefaultConfig, saveConfig, configExists } from "../utils/config.js";
import { writeFile, fileExists, listDir } from "../utils/fs.js";
import { parsePackageJson } from "../utils/parsers.js";
import { log } from "../utils/logger.js";
import { confirm } from "../utils/prompts.js";
import { CONFIG_FILE } from "../constants.js";
import type { TargetsConfig, DetectedStack, StackConfig, ConventionsConfig } from "../types.js";

interface InitOptions {
  targets: string;
  force: boolean;
  detect: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Check for existing config
  if (await configExists(projectRoot)) {
    if (!options.force) {
      const overwrite = await confirm(`${CONFIG_FILE} already exists. Overwrite?`);
      if (!overwrite) {
        log.info("Aborted.");
        return;
      }
    }
  }

  // Parse targets
  const targetNames = options.targets.split(",").map((t) => t.trim());
  const targets: TargetsConfig = {
    claude: targetNames.includes("claude"),
    cursor: targetNames.includes("cursor"),
    copilot: targetNames.includes("copilot"),
    agents: targetNames.includes("agents"),
  };

  if (!targets.claude && !targets.cursor && !targets.copilot && !targets.agents) {
    log.error("No valid targets specified. Use: claude, cursor, copilot, agents");
    process.exit(1);
  }

  // Detect stack
  const spinner = ora("Detecting project stack...").start();
  const stack: DetectedStack = options.detect !== false ? await detectStack(projectRoot) : {
    framework: null, language: null, styling: null, orm: null, database: null,
    testing: [], linting: [], packageManager: null, monorepo: null,
    deployment: null, auth: null, apiStyle: null, stateManagement: null, cicd: null, bundler: null,
  };
  spinner.stop();

  if (options.detect !== false) {
    log.header("\nDetected stack:");
    log.plain(formatStackSummary(stack));
    log.plain("");
  }

  // Build config
  const stackConfig = stackToConfig(stack);
  const pkg = await parsePackageJson(projectRoot);
  const projectName = pkg?.name ?? path.basename(projectRoot);
  const config = createDefaultConfig(projectName, stackConfig, targets);

  // Auto-fill project info from package.json
  if (pkg?.description) {
    config.project.description = pkg.description;
  }

  // Auto-generate architecture string
  config.project.architecture = generateArchitectureString(stackConfig);

  // Auto-detect directory structure with sensible descriptions
  config.structure = await detectStructure(projectRoot);

  // Auto-generate conventions from detected stack
  config.conventions = generateConventions(stack);

  // Save config
  await saveConfig(projectRoot, config);
  log.success(`${CONFIG_FILE} created`);

  // Generate files
  const genSpinner = ora("Generating AI context files...").start();
  const fragments = resolveFragments(stack, config);
  const results = generateAll(stack, config, fragments);
  genSpinner.stop();

  for (const result of results) {
    const outputPath = path.join(projectRoot, result.filePath);
    await writeFile(outputPath, result.content);
    log.success(`${result.filePath} (${result.sections} sections)`);
  }

  log.plain("");
  log.dim(`Files created. Review and customize ${CONFIG_FILE}, then run \`aware sync\` after edits.`);
}

function generateArchitectureString(stack: StackConfig): string {
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

async function detectStructure(projectRoot: string): Promise<Record<string, string>> {
  const structure: Record<string, string> = {};

  // Check top-level dirs
  const topDirs = await listDir(projectRoot);
  for (const dir of topDirs) {
    const key = `${dir}/`;
    if (KNOWN_DIRS[key] && await fileExists(path.join(projectRoot, dir))) {
      structure[key] = KNOWN_DIRS[key];
    }
  }

  // Check src/ subdirectories
  const srcDirs = await listDir(path.join(projectRoot, "src"));
  for (const dir of srcDirs) {
    const key = `src/${dir}/`;
    const fullPath = path.join(projectRoot, "src", dir);
    if (await fileExists(fullPath)) {
      structure[key] = KNOWN_DIRS[key] ?? "";
    }
  }

  return structure;
}

function generateConventions(stack: DetectedStack): ConventionsConfig {
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

    // Import conventions for JS/TS projects
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
