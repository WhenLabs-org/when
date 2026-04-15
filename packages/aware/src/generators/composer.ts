import type {
  ComposedContext,
  AwareConfig,
  ConventionsConfig,
  DetectedStack,
  Fragment,
  ImportConventions,
  NamingConventions,
  StackConfig,
} from "../types.js";

const NAME_MAP: Record<string, string> = {
  nextjs: "Next.js",
  typescript: "TypeScript",
  javascript: "JavaScript",
  tailwindcss: "Tailwind CSS",
  drizzle: "Drizzle ORM",
  prisma: "Prisma",
  vitest: "Vitest",
  jest: "Jest",
  eslint: "ESLint",
  prettier: "Prettier",
  biome: "Biome",
  pnpm: "pnpm",
  npm: "npm",
  yarn: "Yarn",
  bun: "Bun",
  vercel: "Vercel",
  netlify: "Netlify",
  docker: "Docker",
  nextauth: "NextAuth.js",
  clerk: "Clerk",
  trpc: "tRPC",
  graphql: "GraphQL",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  turborepo: "Turborepo",
  nx: "Nx",
  fastify: "Fastify",
  express: "Express",
  fastapi: "FastAPI",
  rust: "Rust",
  python: "Python",
  go: "Go",
  angular: "Angular",
  nestjs: "NestJS",
  vue: "Vue",
  "vite-vue": "Vite + Vue",
  zustand: "Zustand",
  "redux-toolkit": "Redux Toolkit",
  jotai: "Jotai",
  xstate: "XState",
  recoil: "Recoil",
  pinia: "Pinia",
  mobx: "MobX",
  valtio: "Valtio",
  "github-actions": "GitHub Actions",
  "gitlab-ci": "GitLab CI",
  circleci: "CircleCI",
  jenkins: "Jenkins",
  "travis-ci": "Travis CI",
  vite: "Vite",
  webpack: "Webpack",
  esbuild: "esbuild",
  tsup: "tsup",
  swc: "SWC",
  rollup: "Rollup",
  turbopack: "Turbopack",
  parcel: "Parcel",
};

const KEY_LABELS: Record<string, string> = {
  framework: "Framework",
  language: "Language",
  styling: "Styling",
  orm: "ORM",
  database: "Database",
  testing: "Testing",
  linting: "Linting",
  packageManager: "Package Manager",
  monorepo: "Monorepo",
  deployment: "Deployment",
  auth: "Auth",
  apiStyle: "API Style",
  stateManagement: "State Management",
  cicd: "CI/CD",
  bundler: "Bundler",
};

/**
 * Format a stack value like "nextjs@15.1:app-router" into "Next.js 15.1 (App Router)".
 */
export function formatStackValue(key: string, value: string): string {
  // Parse name@version:variant
  const colonIdx = value.indexOf(":");
  let mainPart = value;
  let variant: string | null = null;
  if (colonIdx !== -1) {
    mainPart = value.slice(0, colonIdx);
    variant = value.slice(colonIdx + 1);
  }

  const atIdx = mainPart.indexOf("@");
  let name = mainPart;
  let version: string | null = null;
  if (atIdx !== -1) {
    name = mainPart.slice(0, atIdx);
    version = mainPart.slice(atIdx + 1);
  }

  const displayName = NAME_MAP[name.toLowerCase()] ?? name;
  let result = displayName;
  if (version) {
    result += ` ${version}`;
  }
  if (variant) {
    const formatted = variant
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    result += ` (${formatted})`;
  }
  return result;
}

function formatSingleValue(key: string, value: string): string {
  return formatStackValue(key, value);
}

function buildStackSection(stack: StackConfig): string {
  const lines: string[] = [];

  const keys: (keyof StackConfig)[] = [
    "framework",
    "language",
    "styling",
    "orm",
    "database",
    "testing",
    "linting",
    "packageManager",
    "monorepo",
    "deployment",
    "auth",
    "apiStyle",
    "stateManagement",
    "cicd",
    "bundler",
  ];

  for (const key of keys) {
    const val = stack[key];
    if (val === null || val === undefined) continue;

    const label = KEY_LABELS[key] ?? key;

    if (Array.isArray(val)) {
      if (val.length === 0) continue;
      const formatted = val.map((v) => formatSingleValue(key, v)).join(" + ");
      lines.push(`- **${label}**: ${formatted}`);
    } else {
      lines.push(`- **${label}**: ${formatSingleValue(key, val)}`);
    }
  }

  if (lines.length === 0) return "";
  return `## Tech Stack\n${lines.join("\n")}`;
}

function buildProjectSection(project: AwareConfig["project"]): string {
  const parts: string[] = [];
  if (project.name) {
    parts.push(`# Project: ${project.name}`);
  }
  if (project.description) {
    parts.push(project.description);
  }
  if (project.architecture) {
    parts.push(`## Architecture\n${project.architecture}`);
  }
  return parts.join("\n\n");
}

function renderConventionValue(value: unknown): string[] {
  if (typeof value === "string") {
    return [`- ${value}`];
  }
  if (Array.isArray(value)) {
    return value.map((v) => `- ${v}`);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `- **${k}**: ${v}`,
    );
  }
  return [];
}

function buildConventionsSection(conventions: ConventionsConfig): string {
  const groups: string[] = [];

  for (const [groupKey, groupValue] of Object.entries(conventions)) {
    if (groupValue === undefined || groupValue === null) continue;

    const heading =
      groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
    const lines = renderConventionValue(groupValue);
    if (lines.length === 0) continue;

    groups.push(`### ${heading}\n${lines.join("\n")}`);
  }

  if (groups.length === 0) return "";
  return `## Conventions\n${groups.join("\n\n")}`;
}

function buildRulesSection(rules: string[]): string {
  if (!rules || rules.length === 0) return "";
  const numbered = rules.map((r, i) => `${i + 1}. ${r}`);
  return `## Rules\n${numbered.join("\n")}`;
}

function buildStructureSection(
  structure: Record<string, string>,
): string {
  const entries = Object.entries(structure);
  if (entries.length === 0) return "";

  const lines = [
    "## Project Structure",
    "| Path | Description |",
    "| --- | --- |",
    ...entries.map(([path, desc]) => `| \`${path}\` | ${desc} |`),
  ];
  return lines.join("\n");
}

export function composeContext(
  stack: DetectedStack,
  config: AwareConfig,
  fragments: Fragment[],
): ComposedContext {
  return {
    projectSection: buildProjectSection(config.project),
    stackSection: buildStackSection(config.stack),
    fragmentSections: fragments,
    conventionsSection: buildConventionsSection(config.conventions),
    rulesSection: buildRulesSection(config.rules),
    structureSection: buildStructureSection(config.structure),
  };
}
