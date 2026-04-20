# Aware

Auto-detect your stack and generate AI context files. Part of the [WhenLabs](https://whenlabs.org) toolkit.

Aware scans your project, detects your tech stack, and generates context files for **Claude Code**, **Cursor**, **GitHub Copilot**, and **AGENTS.md** — all from a single source of truth.

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
npm install -g @whenlabs/aware
```

Or run directly:

```bash
npx @whenlabs/aware init
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
aware init --workspace              # Monorepo mode: scaffold a per-package .aware.json that extends the root
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-t, --targets <targets>` | Comma-separated targets: `claude`, `cursor`, `copilot`, `agents`, `all` | `claude,cursor,copilot,agents` |
| `-f, --force` | Overwrite existing files without prompting | `false` |
| `--no-detect` | Skip auto-detection, create empty config | detection on |
| `--workspace` | Monorepo mode: discover workspace packages and scaffold a per-package `.aware.json` that extends the root | `false` |

### `aware sync`

Regenerates context files from `.aware.json` after you've edited it.

```bash
aware sync                          # Regenerate all targets
aware sync --dry-run                # Preview changes without writing
```

### `aware diff`

Shows what changed in your detected stack and generated files since the last sync.

```bash
aware diff                          # Human-readable diff, prompts to sync if drift found
aware diff --check                  # CI mode: exit 0 (clean) / 1 (stack drift) / 2 (tamper)
aware diff --json                   # Emit a machine-readable DriftReport as JSON
aware diff --target claude          # Narrow content drift to one target
aware diff --check --quiet          # Silent CI gate
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--check` | CI mode: exit 0/1/2 for clean/drift/tamper; no interactive prompt | `false` |
| `--json` | Emit a machine-readable `DriftReport` as JSON | `false` |
| `--target <target>` | Narrow content drift to one target (`claude`, `cursor`, `copilot`, `agents`) | all targets |
| `--quiet` | Suppress human output (useful with `--check`) | `false` |

Exit codes for `--check`:

- `0` — No drift
- `1` — Stack drift detected (re-run `aware sync` to update generated files)
- `2` — Tamper detected (a generated file was edited by hand since the last sync)

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
    "orm": "drizzle"
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

Each detected stack component maps to a **fragment** — a chunk of context-aware best practices and conventions. Fragments cover frameworks, ORMs, testing tools, linting, deployment, auth, API patterns, state management, and CI/CD.

Fragments are resolved based on your detected stack and composed into a unified context. Only relevant fragments are included.

### 4. Output Adapters

Each AI tool gets the format it works best with:

| Target | File | Style |
|--------|------|-------|
| Claude Code | `CLAUDE.md` | Full markdown — verbose, all sections, fragment content included inline |
| Cursor | `.cursorrules` | Concise flat rules — imperative style, condensed fragments |
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

## CI Integration

Add a drift gate to your CI so generated context files never fall out of sync with the actual stack:

```yaml
# .github/workflows/aware.yml
name: AI Context Drift
on: [pull_request]
jobs:
  aware:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @whenlabs/aware diff --check --quiet
```

## Tech Stack

- **Language:** TypeScript (ES2022, strict mode)
- **CLI Framework:** [Commander.js](https://github.com/tj/commander.js)
- **Config Parsing:** [js-yaml](https://github.com/nodeca/js-yaml), [toml](https://github.com/BinaryMuse/toml-node), [dotenv](https://github.com/motdotla/dotenv)
- **File Globbing:** [fast-glob](https://github.com/mrmlnc/fast-glob)
- **Output:** [chalk](https://github.com/chalk/chalk), [ora](https://github.com/sindresorhus/ora)
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

# Type check
pnpm lint
```

## License

MIT
