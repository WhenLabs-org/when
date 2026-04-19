# Aware — Current Specification & Roadmap

## What Aware Is

Aware is a CLI tool that auto-detects a project's tech stack and generates AI context files from a single source of truth (`.aware.json`). It outputs to four targets: `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, and `AGENTS.md`.

Lives under the WhenLabs organization at `github.com/WhenLabs-org/aware`. Landing page and web dashboard will live on `whenlabs.org`, not in this repo.

---

## Current State (v0.1.0)

### CLI Commands (7)

| Command | Description |
|---------|-------------|
| `aware init` | Detect stack, create `.aware.json`, generate all target files |
| `aware sync` | Re-detect stack, regenerate target files from config |
| `aware diff` | Colored diff of stack changes since last sync |
| `aware watch` | File watcher with debounced auto-sync |
| `aware validate` | Schema and content validation of `.aware.json` |
| `aware doctor` | Diagnose project health: config issues, stack drift, stale files |
| `aware add` | Interactively add rules, conventions, or structure entries |

### Detectors (15)

| Detector | Detects |
|----------|---------|
| Framework | Next.js (App/Pages Router), Remix, Nuxt, Astro, SvelteKit, Svelte, Angular, NestJS, Fastify, Express, Hono, Vite+React, Vite+Vue, Vue, React, Rust (CLI/Actix/Axum/Rocket), FastAPI, Django, Flask, Go (Gin/Echo/Fiber) |
| Language | TypeScript, JavaScript, Rust, Python, Go |
| Styling | Tailwind CSS, Styled Components, Emotion, Sass, CSS Modules, Vanilla Extract |
| ORM | Prisma, Drizzle, TypeORM, Kysely, Mongoose, Sequelize, SQLAlchemy, Diesel |
| Database | PostgreSQL, MySQL, MongoDB, SQLite, Redis |
| Testing | Vitest, Jest, Playwright, Cypress, pytest, Testing Library |
| Linting | ESLint, Prettier, Biome, rustfmt, Ruff, Clippy |
| Package Manager | pnpm, Bun, Yarn, npm, Cargo, Poetry, uv |
| Monorepo | Turborepo, Nx, pnpm Workspaces, Lerna, npm Workspaces |
| Deployment | Vercel, Netlify, Fly.io, Docker (with Compose variant), Render, Railway |
| Auth | NextAuth, Clerk, Lucia, Better Auth, Passport, Supabase Auth |
| API Style | tRPC, GraphQL, OpenAPI, REST |
| State Management | Zustand, Redux Toolkit, Jotai, Recoil, XState, Pinia, MobX, Valtio |
| CI/CD | GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis CI |
| Bundler | Vite, Webpack, esbuild, tsup, SWC, Rollup, Turbopack, Parcel |

### Fragments (53)

Fragments are TypeScript functions that return context content for a specific tool/framework. Each fragment is conditionally included based on detection results. Priority ranges control ordering: 0-9 language, 10-19 framework, 20-29 styling, 30-39 ORM, 40-49 API/state, 50-59 auth, 60-69 testing, 70-79 linting, 80-89 deployment/CI.

**Frameworks (17):** Next.js 15, Next.js Pages, Remix, Astro, SvelteKit, Vue, Angular, NestJS, Vite+React, Express, Fastify, Hono, Go Web (Gin/Echo/Fiber), Rust CLI, FastAPI, Django, Flask

**Styling (3):** Tailwind CSS, Styled Components, CSS Modules

**ORM (6):** Drizzle, Prisma, TypeORM, Mongoose, SQLAlchemy, Kysely

**API (3):** tRPC, GraphQL, REST

**Auth (5):** NextAuth, Clerk, Lucia, Better Auth, Supabase Auth

**Testing (5):** Vitest, Jest, Playwright, Cypress, pytest

**Linting (3):** ESLint, Prettier, Biome

**State Management (4):** Zustand, Redux Toolkit, Jotai, XState

**CI/CD (2):** GitHub Actions, GitLab CI

**Deployment (5):** Vercel, Netlify, Docker (Compose-aware), Fly.io, Railway

### Output Adapters (4)

| Target | File | Style |
|--------|------|-------|
| Claude | `CLAUDE.md` | Full markdown, verbose, all fragment content |
| Cursor | `.cursorrules` | Concise imperative rules, condensed fragments |
| Copilot | `.github/copilot-instructions.md` | Medium markdown, top 5 bullets per fragment |
| Agents | `AGENTS.md` | Structured: Context, Conventions, Constraints, Testing |

### Init Intelligence

- Auto-fills project name and description from `package.json`
- Generates architecture string (e.g., "Next.js (App Router) with tRPC API layer with Drizzle ORM on PostgreSQL")
- Smart directory structure detection with known-dir descriptions
- Auto-generates naming/import conventions based on detected language and framework

### Tech Stack

- TypeScript ESM, Node 18+
- Commander.js (CLI), chalk (colors), ora (spinners), chokidar (file watching)
- fast-glob (file discovery), fast-json-patch (config diffing)
- tsup (bundler), Vitest (testing)
- 192KB single-file ESM bundle
- 20 test files, 63 tests

---

## Roadmap

### Near-term

**More fragments for detected-but-uncovered tools:**
- State management: Pinia, MobX, Valtio, Recoil fragments
- ORM: Sequelize fragment
- Auth: Passport fragment
- CI/CD: CircleCI, Jenkins fragments
- Bundler: Webpack, Vite, esbuild fragments (build-tool-specific guidance)

**`aware remove` command:**
- Remove rules, structure entries, or conventions interactively
- Complement to `aware add`

**Monorepo support improvements:**
- Detect and generate per-package context files in monorepos
- Resolve workspace dependencies and shared configs
- Support `aware init --workspace` for monorepo-aware generation

**`aware export` command:**
- Export context to clipboard, stdout, or a single combined file
- Useful for pasting into AI chat interfaces that don't read project files

### Mid-term

**Template/preset system:**
- Curated presets for common stacks (e.g., "T3 stack", "Django REST", "Rust CLI")
- `aware init --preset t3` for one-command setup
- User-defined templates stored in `~/.aware/templates/`

**Plugin system:**
- Allow third-party fragment providers via npm packages
- `aware plugin add @aware/fragment-terraform` pattern
- Plugin hooks for custom detectors, generators, and post-sync actions

**`aware merge` command:**
- Merge context from multiple config files (useful for monorepos)
- Combine team-shared base config with individual overrides

**Smarter detection:**
- Read actual source files (AST-light) to detect patterns beyond config files
- Detect component patterns (atomic design, feature-sliced, etc.)
- Detect API patterns from route files (REST endpoints, GraphQL resolvers)
- Version-aware fragments (different guidance for React 18 vs 19, Next.js 14 vs 15)

**Better diff and sync:**
- Show diffs of generated output files, not just stack changes
- `aware sync --interactive` to selectively apply changes
- Conflict resolution when user has hand-edited generated files

### Long-term

**Web dashboard (whenlabs.org):**
- Visual config editor for `.aware.json`
- Stack detection preview without CLI
- Team config sharing and sync
- Analytics on which rules/fragments teams actually use

**IDE extensions:**
- VS Code extension: inline preview of generated context, one-click sync
- JetBrains plugin: same capabilities

**AI-powered features:**
- Analyze codebase to suggest custom rules (beyond what detection covers)
- Learn from user edits to generated files to improve future generation
- Auto-suggest rules based on common patterns in similar stacks

**Multi-language/polyglot projects:**
- Detect and generate context for projects with multiple languages (e.g., Go backend + React frontend)
- Per-directory language/framework detection
- Composite context files that cover the full stack

**Context quality scoring:**
- Score how complete and useful the generated context is
- Suggest improvements: "Your context is 72% complete — add a project description and 3 custom rules to reach 90%"
