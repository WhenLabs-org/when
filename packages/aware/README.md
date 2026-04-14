# Aware

Auto-detect your stack and generate AI context files.

Aware scans your project, detects your tech stack, and generates context files for **Claude Code**, **Cursor**, **GitHub Copilot**, and **AGENTS.md** — all from a single source of truth.

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

```bash
npm install -g aware-cli
```

Or run directly:

```bash
npx aware-cli init
```

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

Regenerates context files from `.aware.json` after you've edited it.

```bash
aware sync                          # Regenerate all targets
aware sync --dry-run                # Preview changes without writing
```

### `aware diff`

Shows what changed in your project since the last sync.

```bash
aware diff
```

### `aware watch`

Watches for project changes and suggests or auto-applies context updates.

```bash
aware watch                         # Watch and suggest
aware watch --auto-sync             # Watch and auto-regenerate
```

### `aware validate`

Validates your `.aware.json` for schema errors and stale paths.

```bash
aware validate
```

## How It Works

### 1. Detection

Aware reads your project files to detect your stack:

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
| Auth | NextAuth, Clerk, Lucia, Passport in deps |
| API Style | tRPC, GraphQL, OpenAPI files |

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
    "Never use any — define proper types"
  ],
  "targets": {
    "claude": true,
    "cursor": true,
    "copilot": true,
    "agents": true
  }
}
```

### 3. Output Adapters

Each AI tool gets the format it works best with:

| Target | File | Style |
|--------|------|-------|
| Claude Code | `CLAUDE.md` | Full markdown, verbose, all conventions |
| Cursor | `.cursorrules` | Concise flat rules, imperative style |
| GitHub Copilot | `.github/copilot-instructions.md` | Medium markdown, trimmed |
| AGENTS.md | `AGENTS.md` | Structured sections (Context, Conventions, Constraints) |

## Supported Stacks

**Frameworks:** Next.js (App/Pages Router), Remix, Astro, SvelteKit, Vite+React, Express, Fastify, Hono, FastAPI, Django, Flask, Rust CLI, Go

**Styling:** Tailwind CSS (v3/v4), styled-components, Emotion, Sass, CSS Modules, Vanilla Extract

**ORMs:** Drizzle, Prisma, TypeORM, Kysely, Mongoose, Sequelize, SQLAlchemy, Diesel

**Databases:** PostgreSQL, MySQL, MongoDB, SQLite (from `.env`, Docker Compose, or ORM config)

**Testing:** Vitest, Jest, Playwright, Cypress, pytest, Testing Library

**Linting:** ESLint (v8/v9), Prettier, Biome, Ruff, rustfmt, Clippy

**Auth:** NextAuth/Auth.js, Clerk, Lucia, Passport, Supabase Auth, Better Auth

**Deployment:** Vercel, Netlify, Fly.io, Railway, Docker, Render

**Package Managers:** pnpm, npm, Yarn, Bun, Cargo, Poetry, uv

**Monorepos:** Turborepo, Nx, pnpm workspaces, Lerna

## License

MIT
