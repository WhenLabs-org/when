# Aware

Auto-detect your stack and generate AI context files. Part of the [WhenLabs](https://whenlabs.org) toolkit.

Aware scans your project, detects your tech stack, and generates context files for **Claude Code**, **Cursor**, **GitHub Copilot**, and **AGENTS.md** -- all from a single source of truth.

> **Part of the [WhenLabs toolkit](https://github.com/WhenLabs-org/when)** — install all 6 tools with one command:
> ```
> npx @whenlabs/when install
> ```

## The Problem

Every AI coding tool reads a different context file:
- **CLAUDE.md** for Claude Code
- **.cursorrules** for Cursor
- **.github/copilot-instructions.md** for GitHub Copilot
- **AGENTS.md** for multi-agent workflows

You end up writing the same conventions three times, they drift apart, and none of them auto-detect your stack.

## The Fix

```bash
$ aware init

Detected Stack
==================================================
  Framework          Next.js 15.1 (App Router) (95%)
  Language           TypeScript 5.5 (99%)
  Styling            Tailwind CSS 4.0 (95%)
  ORM                Drizzle ORM (95%)
  Database           PostgreSQL (90%)
  Testing            Vitest (95%), Playwright (95%)
  Linting            ESLint 9 (95%), Prettier (90%)
  Package Manager    pnpm (99%)
  Deployment         Vercel (95%)
  Auth               NextAuth.js v5 (95%)
  API Style          tRPC (95%)
==================================================

✓ .aware.json created
✓ CLAUDE.md (13 sections)
✓ .cursorrules (4 sections)
✓ .github/copilot-instructions.md (13 sections)
✓ AGENTS.md (6 sections)
```

One command. Full stack detection. Four context files. All in sync.

## Install

> **Recommended:** Install the full WhenLabs toolkit with `npx @whenlabs/when install` to get aware plus 5 other tools in one step.

```bash
npm install -g aware-cli
```

Or run directly:

```bash
npx aware-cli init
```

**Requirements:** Node.js >= 20.12

## Commands

### `aware init`

Scans your project, detects the stack, generates `.aware.json` and all context files.

```bash
aware init                          # Detect and generate
aware init -t claude,cursor         # Only specific targets
aware init --force                  # Overwrite existing files
aware init --no-detect              # Skip detection, create empty config
```

### `aware sync`

Regenerates context files from `.aware.json` after you've edited it. Also re-detects the stack and reports any drift.

```bash
aware sync                          # Regenerate all targets
aware sync --dry-run                # Preview changes without writing
```

### `aware diff`

Shows what changed in your detected stack since the last sync. Displays additions, removals, and changes with colored output, and offers to sync if changes are found.

```bash
aware diff

# CI-friendly: exit 0 if no changes, exit 1 if drift detected
aware diff --exit-code
```

The `--exit-code` flag is useful in CI pipelines to fail a build when AI context files have drifted from the actual stack.

### `aware watch`

Watches for project changes (package.json, config files, .env, etc.) and suggests or auto-applies context updates. Uses native `fs.watch` for efficient file watching with a configurable debounce.

```bash
aware watch                         # Watch and suggest
aware watch --auto-sync             # Watch and auto-regenerate
aware watch --debounce 5000         # Custom debounce (ms, default: 2000)
```

### `aware validate`

Validates your `.aware.json` for schema errors (missing required fields, invalid types) and warnings (stale structure paths, empty rules, no enabled targets).

```bash
aware validate
```

### `aware doctor`

Runs a comprehensive health check on your project's Aware configuration:
- Config file exists and is valid JSON
- Required schema fields present
- Enabled targets have corresponding generated files
- Disabled targets don't have stale files lingering
- Stack drift detection (compares current detection vs. saved state)
- Structure paths exist on disk
- Project description and custom rules are populated
- Staleness check (warns if last sync was 30+ days ago)

```bash
aware doctor
```

### `aware add`

Interactively add a rule, convention, or structure entry to `.aware.json`.

```bash
aware add -t rule                   # Add a project-specific rule
aware add -t convention             # Add a naming/import/testing convention
aware add -t structure              # Add a directory description
```

## How It Works

### 1. Detection

Aware reads your project files to detect your stack. All detectors run in parallel for speed:

| What | How |
|------|-----|
| Framework | `package.json` deps, `Cargo.toml`, `requirements.txt`, `go.mod` |
| Language | `tsconfig.json`, `.python-version`, `rust-toolchain.toml` |
| Styling | Tailwind config, styled-components/Emotion in deps |
| ORM | Prisma schema, Drizzle config, SQLAlchemy in deps |
| Database | `DATABASE_URL` in `.env`, `docker-compose.yml` |
| Testing | Vitest/Jest/Playwright config or deps |
| Linting | ESLint/Prettier/Biome config or deps |
| Package Manager | Lock files (`pnpm-lock.yaml`, `yarn.lock`, etc.) |
| Monorepo | `turbo.json`, `nx.json`, `pnpm-workspace.yaml` |
| Deployment | `vercel.json`, `netlify.toml`, `fly.toml`, `Dockerfile` |
| Auth | NextAuth, Clerk, Lucia, Passport, Supabase Auth, Better Auth in deps |
| API Style | tRPC, GraphQL, OpenAPI files |
| State Mgmt | Zustand, Redux Toolkit, Jotai, XState in deps |
| CI/CD | `.github/workflows/`, `.gitlab-ci.yml` |
| Bundler | Vite, Webpack, esbuild, tsup, SWC, Rollup configs |

Each detection returns a confidence score (0-1) and the source it was detected from.

### 2. Single Source of Truth

Detection results go into `.aware.json`. Edit this file to customize conventions, add rules, and describe your project:

```jsonc
{
  "version": 1,
  "project": {
    "name": "my-app",
    "description": "A B2B SaaS platform",
    "architecture": "Next.js App Router with tRPC and Drizzle"
  },
  "stack": {
    "framework": "nextjs@15.1:app-router",
    "language": "typescript@5.5",
    "orm": "drizzle",
    // ... auto-detected
  },
  "conventions": {
    "naming": {
      "files": "kebab-case",
      "components": "PascalCase"
    }
  },
  "rules": [
    "Use server components by default",
    "Never use any -- define proper types"
  ],
  "structure": {
    "src/app/": "Next.js App Router pages and layouts",
    "src/components/": "Reusable UI components"
  },
  "targets": {
    "claude": true,
    "cursor": true,
    "copilot": true,
    "agents": true
  }
}
```

Conventions are auto-generated based on the detected language and framework (e.g., TypeScript projects get `camelCase` functions, `PascalCase` components; Python projects get `snake_case`).

### 3. Fragment System

Each detected stack component maps to a **fragment** -- a chunk of context-aware best practices and conventions. Fragments cover frameworks, ORMs, testing tools, linting, deployment, auth, API patterns, state management, and CI/CD.

Fragments are resolved based on your detected stack and composed into a unified context. Only relevant fragments are included.

### 4. Output Adapters

Each AI tool gets the format it works best with:

| Target | File | Style |
|--------|------|-------|
| Claude Code | `CLAUDE.md` | Full markdown -- verbose, all sections, fragment content included inline |
| Cursor | `.cursorrules` | Concise flat rules -- imperative style, condensed fragments |
| GitHub Copilot | `.github/copilot-instructions.md` | Medium markdown, trimmed |
| AGENTS.md | `AGENTS.md` | Structured sections (Context, Conventions, Constraints) |

## Supported Stacks

**Frameworks:** Next.js (App/Pages Router), Remix, Astro, SvelteKit, Vite+React, Vite+Vue, Vue, Angular, NestJS, Express, Fastify, Hono, FastAPI, Django, Flask, Rust CLI, Go

**Styling:** Tailwind CSS (v3/v4), styled-components, CSS Modules

**ORMs:** Drizzle, Prisma, TypeORM, Kysely, Mongoose, SQLAlchemy

**Databases:** PostgreSQL, MySQL, MongoDB, SQLite (from `.env`, Docker Compose, or ORM config)

**Testing:** Vitest, Jest, Playwright, Cypress, pytest

**Linting:** ESLint (v8/v9), Prettier, Biome

**Auth:** NextAuth/Auth.js, Clerk, Lucia, Supabase Auth, Better Auth

**API:** tRPC, GraphQL, REST

**State Management:** Zustand, Redux Toolkit, Jotai, XState

**CI/CD:** GitHub Actions, GitLab CI

**Deployment:** Vercel, Netlify, Fly.io, Railway, Docker

**Bundlers:** Vite, Webpack, esbuild, tsup, SWC, Rollup, Turbopack, Parcel

**Package Managers:** pnpm, npm, Yarn, Bun, Cargo, Poetry, uv

**Monorepos:** Turborepo, Nx, pnpm workspaces

## Project Structure

```
aware-tool/
├── src/
│   ├── cli.ts                    # CLI entry point (Commander.js)
│   ├── constants.ts              # Version, config filename, target definitions
│   ├── types.ts                  # TypeScript types for detection, config, fragments
│   ├── commands/
│   │   ├── init.ts               # Detect stack, generate config + context files
│   │   ├── sync.ts               # Re-detect and regenerate from .aware.json
│   │   ├── diff.ts               # Show stack changes since last sync
│   │   ├── watch.ts              # File watcher with auto-sync support
│   │   ├── validate.ts           # Schema and content validation
│   │   ├── doctor.ts             # Project health diagnostics
│   │   └── add.ts                # Interactive add rule/convention/structure
│   ├── detectors/                # 15 parallel stack detectors
│   │   ├── index.ts              # Orchestrates all detectors via Promise.all
│   │   ├── framework.ts          # Next.js, Remix, Astro, Express, etc.
│   │   ├── language.ts           # TypeScript, Python, Rust, Go
│   │   ├── styling.ts            # Tailwind, styled-components, CSS Modules
│   │   ├── orm.ts                # Drizzle, Prisma, TypeORM, etc.
│   │   ├── database.ts           # PostgreSQL, MySQL, MongoDB, SQLite
│   │   ├── testing.ts            # Vitest, Jest, Playwright, Cypress, pytest
│   │   ├── linting.ts            # ESLint, Prettier, Biome
│   │   ├── package-manager.ts    # pnpm, npm, Yarn, Bun
│   │   ├── monorepo.ts           # Turborepo, Nx, pnpm workspaces
│   │   ├── deployment.ts         # Vercel, Netlify, Fly.io, Docker
│   │   ├── auth.ts               # NextAuth, Clerk, Lucia, etc.
│   │   ├── api-style.ts          # tRPC, GraphQL, REST
│   │   ├── state-management.ts   # Zustand, Redux Toolkit, Jotai, XState
│   │   ├── cicd.ts               # GitHub Actions, GitLab CI
│   │   └── bundler.ts            # Vite, Webpack, esbuild, etc.
│   ├── fragments/                # Stack-specific context fragments
│   │   ├── index.ts              # Resolves and sorts applicable fragments
│   │   ├── common.ts             # Shared fragment utilities
│   │   ├── framework/            # 17 framework fragments
│   │   ├── styling/              # 3 styling fragments
│   │   ├── orm/                  # 6 ORM fragments
│   │   ├── testing/              # 5 testing fragments
│   │   ├── linting/              # 3 linting fragments
│   │   ├── deployment/           # 5 deployment fragments
│   │   ├── auth/                 # 5 auth fragments
│   │   ├── api/                  # 3 API fragments
│   │   ├── state-management/     # 4 state management fragments
│   │   └── cicd/                 # 2 CI/CD fragments
│   ├── generators/               # Output adapters per AI tool
│   │   ├── index.ts              # Runs enabled generators
│   │   ├── base.ts               # Abstract base generator
│   │   ├── composer.ts           # Composes context from config + fragments
│   │   ├── claude.ts             # Full markdown output for CLAUDE.md
│   │   ├── cursor.ts             # Concise imperative rules for .cursorrules
│   │   ├── copilot.ts            # Medium markdown for copilot-instructions.md
│   │   └── agents.ts             # Structured sections for AGENTS.md
│   └── utils/
│       ├── config.ts             # Load/save .aware.json, compute detection hash
│       ├── fs.ts                 # File system helpers
│       ├── logger.ts             # Colored console output
│       ├── parsers.ts            # package.json, TOML, YAML parsers
│       └── prompts.ts            # Interactive confirm/prompt helpers
├── tests/
│   ├── detectors/                # Tests for all 15 detectors
│   ├── generators/               # Tests for Claude and Cursor generators
│   ├── fragments/                # Tests for fragment composition
│   ├── utils/                    # Tests for config and parser utilities
│   └── fixtures/                 # Sample projects (nextjs-app, vite-react, etc.)
├── package.json
├── tsconfig.json
├── tsup.config.ts                # Bundles to single ESM file with node shebang
└── vitest.config.ts
```

## Tech Stack

- **Language:** TypeScript (ES2022, strict mode)
- **CLI Framework:** [Commander.js](https://github.com/tj/commander.js)
- **File Watching:** [chokidar](https://github.com/paulmillr/chokidar)
- **Config Parsing:** [js-yaml](https://github.com/nodeca/js-yaml), [toml](https://github.com/BinaryMuse/toml-node), [dotenv](https://github.com/motdotla/dotenv)
- **Diffing:** [fast-json-patch](https://github.com/Starcounter-Jack/JSON-Patch)
- **File Globbing:** [fast-glob](https://github.com/mrmlnc/fast-glob)
- **Output:** [chalk](https://github.com/chalk/chalk), [ora](https://github.com/sindresorhus/ora) (spinners)
- **Build:** [tsup](https://github.com/egoist/tsup) (ESM, Node 20+ target)
- **Testing:** [Vitest](https://vitest.dev/) with fixture-based project testing

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev [command]

# Build
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check
pnpm lint
```

## License

MIT
