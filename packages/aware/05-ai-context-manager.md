# ContextPilot — AI Context File Manager

## What We're Building

ContextPilot is a CLI tool that initializes, maintains, and syncs AI context files (CLAUDE.md, .cursorrules, .github/copilot-instructions.md, AGENTS.md) from a single source of truth. It auto-detects your stack, generates intelligent starter context, keeps it updated as your project evolves, and ensures all three major AI coding tools get consistent instructions.

---

## The Core Problem

AI-assisted development has a context problem. The tools are powerful, but they're only as good as the context you give them.

**The current state:**

- **CLAUDE.md** — Claude Code reads this for project context, coding conventions, and instructions
- **.cursorrules** — Cursor reads this for similar project-level instructions
- **.github/copilot-instructions.md** — GitHub Copilot reads this for workspace-level guidance
- **AGENTS.md** — Emerging standard for multi-agent context

Every developer using AI coding tools faces these problems:

1. **Cold start.** You start a new project and Claude Code knows nothing about it. You spend 20 minutes writing a CLAUDE.md from scratch, explaining your stack, conventions, and architecture. Then you do it again for .cursorrules. And again for Copilot.

2. **Drift.** Your CLAUDE.md says "we use Prisma ORM" but you migrated to Drizzle 3 months ago. Claude keeps generating Prisma code. You waste time correcting it.

3. **Inconsistency.** Your CLAUDE.md has different instructions than your .cursorrules. Claude Code writes camelCase, Cursor writes snake_case. Both are "following the rules."

4. **No auto-detection.** Your project has a package.json with Next.js 15, Tailwind 4, TypeScript 5.5, Prisma, and tRPC. The CLAUDE.md should know all of this automatically — but you're hand-writing it every time.

5. **No community templates.** Every Next.js project needs roughly the same CLAUDE.md base. Every Rust project needs the same .cursorrules foundation. But everyone's writing these from scratch.

6. **No update mechanism.** When you add a new dependency or change your testing framework, nothing prompts you to update your AI context files.

---

## How It Works

### 1. Initialize — Auto-Detect and Generate

```bash
$ contextpilot init

Detecting project stack...

  Framework:    Next.js 15.1 (App Router)
  Language:     TypeScript 5.5
  Styling:      Tailwind CSS 4.0
  ORM:          Drizzle ORM
  Database:     PostgreSQL (from DATABASE_URL in .env)
  Testing:      Vitest + Playwright
  Linting:      ESLint 9 (flat config) + Prettier
  Package Mgr:  pnpm
  Monorepo:     No
  API style:    tRPC
  Auth:         NextAuth.js v5
  Deployment:   Vercel (detected vercel.json)

Generating AI context files...

  ✓ CLAUDE.md (for Claude Code)
  ✓ .cursorrules (for Cursor)
  ✓ .github/copilot-instructions.md (for GitHub Copilot)
  ✓ .contextpilot.json (source of truth — edit this, sync to others)

Files created. Review and customize, then run `contextpilot sync` after edits.
```

### 2. The Source of Truth (`.contextpilot.json`)

Instead of maintaining three files, you maintain one:

```jsonc
// .contextpilot.json
{
  "version": 1,
  "project": {
    "name": "my-saas-app",
    "description": "A B2B SaaS platform for invoice management",
    "architecture": "Next.js App Router with tRPC API layer and Drizzle ORM"
  },

  // Auto-detected — you can override or extend
  "stack": {
    "framework": "nextjs@15.1",
    "language": "typescript@5.5",
    "styling": "tailwindcss@4.0",
    "orm": "drizzle-orm",
    "database": "postgresql",
    "testing": ["vitest", "playwright"],
    "linting": ["eslint@9", "prettier"],
    "packageManager": "pnpm",
    "deployment": "vercel"
  },

  // Your coding conventions
  "conventions": {
    "naming": {
      "files": "kebab-case",
      "components": "PascalCase",
      "functions": "camelCase",
      "constants": "UPPER_SNAKE_CASE",
      "database": "snake_case"
    },
    "imports": {
      "style": "named",
      "order": ["react", "next", "third-party", "local", "types"],
      "alias": "@/"
    },
    "components": {
      "style": "functional with arrow functions",
      "stateManagement": "React hooks + Zustand for global state",
      "propsPattern": "destructured with TypeScript interface"
    },
    "api": {
      "style": "tRPC routers in src/server/routers/",
      "validation": "Zod schemas co-located with routers",
      "errorHandling": "Custom AppError class with error codes"
    },
    "testing": {
      "unit": "Vitest with Testing Library for components",
      "e2e": "Playwright for critical user flows",
      "coverage": "Minimum 80% for business logic"
    }
  },

  // Project-specific rules
  "rules": [
    "Always use server components by default. Only add 'use client' when you need interactivity.",
    "Never use any. Define proper TypeScript types for all function parameters and return values.",
    "Database queries go through Drizzle. Never write raw SQL.",
    "All API mutations must have Zod validation schemas.",
    "Use Tailwind classes directly. Do not create CSS files or use CSS-in-JS.",
    "Error boundaries should exist at the layout level, not per-component.",
    "Environment variables must be accessed through src/lib/env.ts, never directly via process.env."
  ],

  // Directory structure hints
  "structure": {
    "src/app/": "Next.js App Router pages and layouts",
    "src/components/": "Reusable UI components",
    "src/server/": "tRPC routers, database queries, business logic",
    "src/lib/": "Shared utilities, configs, type definitions",
    "src/hooks/": "Custom React hooks",
    "tests/": "Test files mirroring src/ structure"
  },

  // Output targets
  "targets": {
    "claude": true,      // Generate CLAUDE.md
    "cursor": true,      // Generate .cursorrules
    "copilot": true,     // Generate .github/copilot-instructions.md
    "agents": false      // Generate AGENTS.md (opt-in)
  }
}
```

### 3. Sync — One Source, Multiple Outputs

```bash
$ contextpilot sync

Syncing from .contextpilot.json...

  ✓ CLAUDE.md — updated (2 changes)
      + Added Drizzle ORM conventions (detected drizzle.config.ts)
      ~ Updated TypeScript version reference (5.4 → 5.5)
  ✓ .cursorrules — updated (2 changes)
  ✓ .github/copilot-instructions.md — updated (2 changes)

All targets in sync.
```

### 4. Watch — Stay Current Automatically

```bash
$ contextpilot watch

Watching for project changes...

[14:32:01] Detected: new dependency added (zod@3.23)
  → Updated .contextpilot.json stack
  → Regenerated context files
  → Added Zod validation conventions

[15:10:44] Detected: new directory created (src/workers/)
  → Added to structure map
  → Suggestion: add description for src/workers/ in .contextpilot.json

[16:45:22] Detected: vitest.config.ts modified
  → Updated testing configuration in context files
```

### 5. Templates — Community Starters

```bash
# List available templates
$ contextpilot templates

POPULAR TEMPLATES:
  nextjs-app-router     Next.js 15 App Router + TypeScript (★ 2,340)
  nextjs-pages          Next.js Pages Router (★ 890)
  vite-react             Vite + React + TypeScript (★ 1,200)
  fastify-api           Fastify REST API + TypeScript (★ 780)
  rust-cli              Rust CLI application (★ 560)
  python-fastapi        FastAPI + SQLAlchemy (★ 920)
  expo-react-native     Expo + React Native (★ 430)
  turborepo             Turborepo monorepo setup (★ 340)

# Initialize from a template
$ contextpilot init --template nextjs-app-router

# Publish your own template
$ contextpilot publish my-custom-template
```

### 6. Diff — See What Changed

```bash
$ contextpilot diff

Changes since last sync (3 days ago):

PROJECT CHANGES DETECTED:
  + Added dependency: @tanstack/react-query@5.x
  + New file: src/lib/query-client.ts
  ~ Changed: tsconfig.json (added new path aliases)
  - Removed dependency: swr (likely replaced by react-query)

SUGGESTED CONTEXT UPDATES:
  1. Replace SWR data fetching conventions with React Query patterns
  2. Add @tanstack/react-query to the import order rules
  3. Document the query client setup in src/lib/query-client.ts

Apply suggestions? (y/n/edit): y
  ✓ Updated .contextpilot.json
  ✓ Regenerated CLAUDE.md, .cursorrules, copilot-instructions.md
```

---

## Technical Architecture

### Stack Detection Engine

The tool detects your stack by reading project files:

| Detection | Source Files |
|-----------|-------------|
| Framework | package.json deps, Cargo.toml, requirements.txt, go.mod |
| Language version | tsconfig.json target, .python-version, rust-toolchain.toml |
| Styling | tailwind.config, postcss.config, styled-components in deps |
| ORM | prisma/schema.prisma, drizzle.config.ts, sqlalchemy in deps |
| Database | .env (DATABASE_URL pattern), docker-compose.yml |
| Testing | vitest.config, jest.config, pytest.ini, Cargo.toml [dev-deps] |
| Linting | eslint.config, .prettierrc, rustfmt.toml, ruff.toml |
| Package manager | pnpm-lock.yaml, yarn.lock, package-lock.json, bun.lockb |
| Monorepo | turbo.json, pnpm-workspace.yaml, nx.json, lerna.json |
| Deployment | vercel.json, netlify.toml, fly.toml, Dockerfile |
| Auth | next-auth config, passport in deps, clerk in deps |
| API style | trpc router files, openapi spec, graphql schema |

### Template Generation

Each detected stack component maps to a context template fragment:

```
detected: nextjs@15 + app-router
→ loads: templates/fragments/nextjs-15-app-router.md
→ includes: Server Components default, route handlers, metadata API conventions

detected: drizzle-orm
→ loads: templates/fragments/drizzle-orm.md
→ includes: Schema definition patterns, query conventions, migration workflow

detected: vitest
→ loads: templates/fragments/vitest.md
→ includes: Test file naming, mocking patterns, coverage expectations
```

Fragments are composed into a full context file, with project-specific rules layered on top.

### Output Adapters

Each AI tool has slightly different format requirements:

| Tool | File | Format Notes |
|------|------|-------------|
| Claude Code | CLAUDE.md | Markdown, supports headers and code blocks, unlimited length |
| Cursor | .cursorrules | Plain text preferred, more concise, top-level rules |
| GitHub Copilot | .github/copilot-instructions.md | Markdown, scoped to workspace |
| AGENTS.md | AGENTS.md | Emerging standard, structured sections |

The sync engine has an adapter per target that formats the same underlying context appropriately.

### Stack

```
Language:       TypeScript
CLI framework:  Commander.js
Detection:      Custom file parsers (package.json, toml, yaml, etc.)
Templates:      Handlebars for fragment composition
File watching:  chokidar
Diffing:        fast-json-patch for .contextpilot.json changes
Config:         cosmiconfig
Package:        npm, homebrew
Registry:       GitHub-based template registry (JSON index + raw file URLs)
                or simple npm packages (@contextpilot/template-nextjs)
Testing:        Vitest with fixture projects
```

### Project Structure

```
contextpilot/
├── src/
│   ├── cli.ts
│   ├── commands/
│   │   ├── init.ts               # Detect stack, generate files
│   │   ├── sync.ts               # Sync source of truth to targets
│   │   ├── watch.ts              # Watch for changes, auto-update
│   │   ├── diff.ts               # Show what changed since last sync
│   │   ├── templates.ts          # Browse/apply community templates
│   │   ├── publish.ts            # Publish a custom template
│   │   └── validate.ts           # Validate .contextpilot.json
│   ├── detectors/
│   │   ├── framework.ts          # Detect framework from deps
│   │   ├── language.ts           # Detect language and version
│   │   ├── database.ts           # Detect database from env/compose
│   │   ├── testing.ts            # Detect test framework
│   │   ├── styling.ts            # Detect CSS approach
│   │   ├── orm.ts                # Detect ORM
│   │   ├── deployment.ts         # Detect deployment target
│   │   ├── monorepo.ts           # Detect monorepo setup
│   │   └── index.ts              # Orchestrate all detectors
│   ├── generators/
│   │   ├── claude.ts             # Generate CLAUDE.md from context
│   │   ├── cursor.ts             # Generate .cursorrules from context
│   │   ├── copilot.ts            # Generate copilot-instructions.md
│   │   ├── agents.ts             # Generate AGENTS.md
│   │   └── base.ts               # Shared generation logic
│   ├── templates/
│   │   ├── fragments/            # Stack-specific template fragments
│   │   │   ├── nextjs-15.hbs
│   │   │   ├── drizzle-orm.hbs
│   │   │   ├── vitest.hbs
│   │   │   ├── tailwindcss-4.hbs
│   │   │   ├── fastify.hbs
│   │   │   ├── rust-cli.hbs
│   │   │   └── ... (50+ fragments)
│   │   ├── starters/             # Full starter templates
│   │   │   ├── nextjs-app-router.json
│   │   │   ├── vite-react.json
│   │   │   └── ...
│   │   └── registry.ts           # Template discovery and loading
│   ├── watcher/
│   │   ├── detector.ts           # Detect meaningful project changes
│   │   ├── updater.ts            # Apply detected changes to context
│   │   └── notifier.ts           # Notify user of suggested updates
│   └── utils/
│       ├── file.ts               # File system utilities
│       ├── parsers.ts            # Config file parsers
│       └── diff.ts               # JSON diffing
├── templates/                    # Bundled template fragments
├── tests/
│   ├── fixtures/                 # Sample projects for detection testing
│   └── detectors/
├── package.json
└── README.md
```

---

## Build Plan (Solo, Claude Code)

### Week 1: Detection + Generation

- Day 1: Project setup, detection framework, package.json parser
- Day 2: Framework detector (Next.js, Vite, Fastify, Express, etc.)
- Day 3: All remaining detectors (language, ORM, testing, styling, deployment)
- Day 4: Template fragment system — compose fragments into full context
- Day 5: CLAUDE.md generator with proper formatting
- Day 6: .cursorrules and copilot-instructions.md generators
- Day 7: `init` command — end-to-end: detect → generate → write files

### Week 2: Sync + Watch + Polish

- Day 1: `.contextpilot.json` schema definition, parser, validator
- Day 2: `sync` command — read source of truth, regenerate all targets
- Day 3: `diff` command — detect project changes since last sync
- Day 4: `watch` command with chokidar — auto-detect and suggest updates
- Day 5: 20+ template fragments for popular stacks
- Day 6: npm publish, homebrew formula, documentation
- Day 7: Landing page, demo GIF, launch prep

### Week 3: Community + Paid

- Day 1-2: Template registry — browse, apply, publish community templates
- Day 3: GitHub-based template hosting (users publish as repos/gists)
- Day 4: Team sync — shared .contextpilot.json conventions across org repos
- Day 5: VS Code extension — sidebar showing current context, one-click sync
- Day 6-7: Billing for team features, private template hosting

---

## Monetization

| Tier | Price | Features |
|------|-------|----------|
| Free (CLI) | $0 | Init, sync, watch, diff, all generators, community templates |
| Pro | $7/mo | Private templates, priority template fragments, AI-powered convention suggestions |
| Team | $19/mo (5 users) | Shared org conventions, enforce context standards across repos, template marketplace publishing |

The free tier should be extremely generous. The goal is adoption — become the standard way to manage AI context files, then monetize team/org features.

---

## Why This Is the Right Time

1. **AI coding tools just hit mainstream.** Claude Code, Cursor, and Copilot are now standard developer tools. But the context management layer is completely DIY.

2. **No standard exists.** CLAUDE.md, .cursorrules, and copilot-instructions are all different formats from different vendors. Someone needs to unify them.

3. **Context engineering is the new skill.** The quality of your AI output is directly proportional to the quality of your context. Better context files = faster development = real ROI.

4. **Network effects.** Once developers share templates ("here's the perfect CLAUDE.md for Next.js 15"), the template registry becomes a moat. People come for the templates, stay for the sync.

5. **You're the ideal founder for this.** You already manage CLAUDE.md across 10+ projects. You understand the problem deeply. Your first users are developers exactly like you.

---

## The Killer Feature: `contextpilot init` Magic

When a developer runs `contextpilot init` in a mature project and sees:

```
Detected: Next.js 15.1 (App Router) + TypeScript 5.5 + Drizzle ORM + Vitest + Tailwind 4
Generated CLAUDE.md with 47 conventions automatically detected.
```

That's the moment they become a user. The auto-detection eliminates the cold-start problem that makes most developers never write a CLAUDE.md in the first place.
