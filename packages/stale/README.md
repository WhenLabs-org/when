# Stale

Detect documentation drift in your codebase. Stale cross-references what your README, CONTRIBUTING.md, and docs say against what your code actually does -- and flags every discrepancy.

## The Problem

Documentation rots silently. README says `npm run dev` but the script was renamed months ago. Docs reference `src/config/database.js` but the file was moved to TypeScript. Setup instructions say "requires Node 16+" but `package.json` has `engines: ">=20"`. Stale catches all of this automatically.

## Why stale?

| | stale | Manual checking | Generic linters |
|---|---|---|---|
| Detects semantic drift | Compares code behavior vs docs | Hope someone notices | Checks formatting, not accuracy |
| Cross-references code | Validates commands, paths, env vars, versions against source | Requires reading every file | No codebase awareness |
| AI-powered deep analysis | Claude finds subtle meaning mismatches | Not scalable | Not available |
| MCP / Claude Code native | Works as an MCP tool in your editor | N/A | N/A |
| Zero config | Works out of the box, optional `.stale.yml` | N/A | Requires rule configuration |

## Features

### Static Analysis (free, no API key)

Seven built-in analyzers run deterministic checks against your codebase:

| Analyzer | What It Checks |
|----------|---------------|
| **Commands** | `npm run`, `yarn`, `make` commands in docs vs `package.json` scripts and Makefile targets |
| **File Paths** | Referenced file paths vs actual filesystem (handles `.js` to `.ts` renames) |
| **Env Vars** | Documented env vars vs `process.env` / `os.environ` usage in code (bidirectional) |
| **URLs** | CI migration detection (Travis/CircleCI badge + GitHub Actions exists), broken relative links |
| **Versions** | "Requires Node X" claims vs `engines`, `.nvmrc`, `.node-version`, Dockerfile |
| **Dependencies** | "Requires Redis/Postgres" claims vs npm deps and docker-compose services |
| **API Routes** | Documented HTTP endpoints vs route definitions (Express, Fastify, Koa, Hono, Flask) |

### AI-Powered Deep Analysis (requires API key)

With the `--deep` flag, Stale sends doc + code context to Claude for semantic analysis:

- **Semantic drift** -- does the description match what the code actually does?
- **Completeness** -- are there setup steps or features missing from docs?
- **Example freshness** -- do code examples use current patterns from the codebase?

### Output Formats

- **Terminal** -- colored output with chalk, grouped by category, summary box
- **JSON** -- machine-readable for CI pipelines
- **Markdown** -- GitHub-flavored with summary table and collapsible sections (ideal for PR comments)
- **SARIF** -- GitHub Code Scanning integration

## Installation

Requires **Node.js >= 20**.

```bash
# Clone and install
git clone <repo-url> && cd stale-tool
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

## Usage

### CLI

```bash
# Scan current directory
stale scan

# Scan a specific project
stale scan --path /path/to/project

# JSON output for CI
stale scan --format json

# Markdown output (for PR comments)
stale scan --format markdown

# SARIF output (for GitHub Code Scanning)
stale scan --format sarif

# AI-powered deep analysis
STALE_AI_KEY=your-key stale scan --deep

# Watch mode -- re-scans on file changes
stale watch

# Generate a .stale.yml config file
stale init
```

### Development

```bash
# Run without building (uses tsx)
npm run dev -- scan --path tests/fixtures/sample-project

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <path>` | Project directory to scan | `.` (current directory) |
| `-f, --format <fmt>` | Output format: `terminal`, `json`, `markdown`, `sarif` | `terminal` |
| `-d, --deep` | Enable AI-powered analysis (requires `STALE_AI_KEY` env var) | off |
| `-c, --config <path>` | Path to config file | auto-detect `.stale.yml` |
| `-v, --verbose` | Verbose error output | off |

## Configuration

Create a `.stale.yml` (or `.stale.yaml`) in your project root, or run `stale init` to generate one with defaults.

```yaml
# Which docs to scan (glob patterns)
docs:
  - README.md
  - CONTRIBUTING.md
  - docs/**/*.md

# Paths to ignore
ignore:
  - node_modules/**
  - dist/**
  - .git/**

# Toggle individual checks
checks:
  commands: true
  filePaths: true
  envVars: true
  urls: true               # or { checkExternal: true } to verify external URLs
  versions: true
  dependencies: true
  apiRoutes: true

# AI analysis settings
ai:
  enabled: false
  model: sonnet             # sonnet (fast) or opus (thorough)
  checks:
    semantic: true
    completeness: true
    examples: true

# Customize severity levels
severity:
  missingFile: error
  deadCommand: error
  undocumentedEnvVar: warning
  staleEnvVar: error
  brokenUrl: error
  versionMismatch: error
  missingDependency: warning
  routeMismatch: error
```

## GitHub Action

```yaml
# .github/workflows/stale.yml
name: Documentation Drift Check
on:
  pull_request:
    paths:
      - '**.md'
      - 'package.json'
      - 'src/**'
      - 'docs/**'

jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/stale-action@v1
        with:
          deep: true              # Enable AI analysis
          fail-on: error          # Fail PR on errors (not warnings)
          comment: true           # Post results as PR comment
          format: terminal        # Output format
        env:
          STALE_AI_KEY: ${{ secrets.STALE_AI_KEY }}
```

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `deep` | Enable AI-powered analysis | `false` |
| `fail-on` | Fail on: `error`, `warning`, or `never` | `error` |
| `comment` | Post results as a PR comment | `true` |
| `config` | Path to `.stale.yml` config file | auto-detect |
| `format` | Output format | `terminal` |

## Project Structure

```
stale-tool/
├── src/
│   ├── cli.ts                          # Entry point (Commander.js)
│   ├── types.ts                        # Shared types and interfaces
│   ├── config.ts                       # Config loader (.stale.yml + defaults)
│   ├── errors.ts                       # Custom error classes
│   ├── commands/
│   │   ├── scan.ts                     # Main scan pipeline
│   │   ├── init.ts                     # Generate config file
│   │   └── watch.ts                    # Watch mode with debounce
│   ├── analyzers/
│   │   ├── registry.ts                 # Analyzer registry + parallel runner
│   │   ├── static/
│   │   │   ├── commands.ts             # CLI command checker
│   │   │   ├── file-paths.ts           # File path checker
│   │   │   ├── env-vars.ts             # Env var checker
│   │   │   ├── urls.ts                 # URL/link checker
│   │   │   ├── versions.ts             # Runtime version checker
│   │   │   ├── dependencies.ts         # Dependency/prerequisite checker
│   │   │   └── api-routes.ts           # API endpoint checker
│   │   └── ai/
│   │       ├── client.ts               # AI SDK wrapper with retry
│   │       ├── semantic.ts             # Semantic drift detection
│   │       ├── completeness.ts         # Missing docs detection
│   │       └── examples.ts             # Example freshness check
│   ├── parsers/
│   │   ├── markdown.ts                 # Markdown to structured data (remark/unified)
│   │   ├── codebase.ts                 # Extract facts from source code
│   │   └── config.ts                   # Parse package.json, docker-compose, etc.
│   ├── reporters/
│   │   ├── index.ts                    # Reporter registry
│   │   ├── terminal.ts                 # Colored terminal output
│   │   ├── json.ts                     # JSON output
│   │   ├── markdown.ts                 # GitHub-flavored markdown
│   │   └── sarif.ts                    # SARIF v2.1.0
│   └── utils/
│       ├── similarity.ts               # Levenshtein fuzzy matching
│       ├── git.ts                      # Git history helpers
│       └── id.ts                       # Deterministic issue IDs
├── action/
│   ├── action.yml                      # GitHub Action definition
│   ├── index.ts                        # Action entry point
│   └── Dockerfile                      # Node 20 Alpine container
├── tests/
│   ├── fixtures/sample-project/        # Fake project with intentional drift
│   ├── analyzers/                      # Unit tests per analyzer
│   └── integration/                    # End-to-end scan tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022, ESM)
- **CLI framework**: Commander.js
- **Markdown parsing**: remark / unified (AST walking)
- **AI**: Anthropic Claude API (Sonnet or Opus)
- **File matching**: fast-glob
- **Git integration**: simple-git
- **Fuzzy matching**: fastest-levenshtein
- **Terminal output**: chalk + boxen
- **Template rendering**: Handlebars (markdown reporter)
- **Testing**: Vitest
- **Runtime**: Node.js >= 20

## How It Works

1. **Parse docs** -- Markdown files are parsed into structured data (code blocks, commands, links, file paths, env vars, version claims, dependency claims, API endpoints) using remark/unified AST walking.
2. **Extract codebase facts** -- The project is scanned for package.json scripts, Makefile targets, env var usage, route definitions, docker-compose services, version files, and the full file listing.
3. **Run analyzers** -- All enabled analyzers run in parallel via `Promise.allSettled`. Each compares doc claims against codebase facts and produces `DriftIssue` objects with severity, location, message, and suggestions.
4. **Report** -- Issues are assembled into a `DriftReport` and rendered in the chosen output format. The CLI exits with code 1 if any errors are found.

## License

MIT
