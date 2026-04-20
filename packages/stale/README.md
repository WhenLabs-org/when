# Stale

Detect documentation drift in your codebase. Part of the [WhenLabs](https://whenlabs.org) toolkit.

Stale cross-references what your README, CONTRIBUTING.md, and docs say against what your code actually does — and flags every discrepancy.

> **Part of the [WhenLabs toolkit](https://github.com/WhenLabs-org/when)** — install all 6 tools with one command:
> ```
> npx @whenlabs/when install
> ```

## The Problem

Documentation rots silently. README says `npm run dev` but the script was renamed months ago. Docs reference `src/config/database.js` but the file was moved to TypeScript. Setup instructions say "requires Node 16+" but `package.json` has `engines: ">=20"`. Stale catches all of this automatically — no API keys, no network calls.

## Why stale?

| | stale | Manual checking | Generic linters |
|---|---|---|---|
| Detects doc-vs-code drift | Compares doc claims against code behavior | Hope someone notices | Checks formatting, not accuracy |
| Cross-references code | Validates commands, paths, env vars, versions against source | Requires reading every file | No codebase awareness |
| Deterministic | No API keys, no flaky LLM calls, same input → same output | N/A | Yes |
| Zero config | Works out of the box, optional `.stale.yml` | N/A | Requires rule configuration |

## Features

Nine built-in analyzers run deterministic checks against your codebase:

| Analyzer | What It Checks |
|----------|---------------|
| **Commands** | `npm run`, `yarn`, `make` commands in docs vs `package.json` scripts and Makefile targets |
| **File Paths** | Referenced file paths vs actual filesystem (handles `.js` → `.ts` renames with fuzzy matching) |
| **Env Vars** | Documented env vars vs `process.env` / `os.environ` usage in code (bidirectional) |
| **URLs** | CI migration detection (Travis/CircleCI badge + GitHub Actions exists), broken relative links |
| **Ports** | "Runs on port 3000" claims vs `.env`, `docker-compose.yml`, and config files |
| **Versions** | "Requires Node X" claims vs `engines`, `.nvmrc`, `.node-version`, Dockerfile |
| **Dependencies** | "Requires Redis/Postgres" claims vs npm deps and docker-compose services |
| **API Routes** | Documented HTTP endpoints vs route definitions (Express, Fastify, Koa, Hono, Flask) |
| **Git Staleness** *(opt-in)* | Flags docs that have not been updated in 30+ days when referenced source files have had commits since |
| **Comment Staleness** *(opt-in)* | Finds inline code comments that reference renamed or deleted functions/classes |

### Git Staleness

```bash
stale scan --git
```
```
  ⚠ README.md last updated 47 days ago; src/ has 12 commits since
```

### Comment Staleness

```
  ⚠ src/api.ts:42 — comment references `handleAuth()` but function was renamed to `authenticateRequest()`
```

### Output Formats

- **Terminal** — colored output with chalk, grouped by category, summary box
- **JSON** — machine-readable for CI pipelines
- **Markdown** — GitHub-flavored with summary table and collapsible sections (ideal for PR comments)

## Installation

> **Recommended:** Install the full WhenLabs toolkit with `npx @whenlabs/when install` to get stale plus 5 other tools in one step.

```bash
npm install -g @whenlabs/stale
```

Requires **Node.js >= 20**. Bundles the TypeScript compiler at runtime (used by the AST extractor for JS/TS source parsing) — adds ~50 MB to the install footprint.

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

# Enable git-history staleness checks (opt-in)
stale scan --git

# Generate a .stale.yml config file
stale init
```

### CLI Options

#### `stale scan`

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <path>` | Project directory to scan | `.` (current directory) |
| `-f, --format <fmt>` | Output format: `terminal`, `json`, `markdown` | `terminal` |
| `-g, --git` | Enable git history staleness checks | off |
| `-c, --config <path>` | Path to config file | auto-detect `.stale.yml` |
| `-v, --verbose` | Verbose error output | off |

#### `stale init`

Generate a `.stale.yml` config file in the current directory with sensible defaults.

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
  urls: true
  versions: true
  dependencies: true
  apiRoutes: true
  gitStaleness: false        # opt-in
  commentStaleness: false    # opt-in

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
  portMismatch: warning
  staleDoc: warning
  staleComment: info

# Default output format
output:
  format: terminal            # terminal | json | markdown
```

## CI Integration

`stale scan` exits with code `1` if any errors are found — drop it into any CI runner as a doc-drift gate.

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
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @whenlabs/stale scan --format markdown
```

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022, ESM)
- **CLI framework**: Commander.js
- **Markdown parsing**: remark / unified (AST walking)
- **File matching**: fast-glob
- **Git integration**: simple-git
- **Fuzzy matching**: fastest-levenshtein
- **Terminal output**: chalk + boxen
- **Config parsing**: yaml
- **Testing**: Vitest
- **Runtime**: Node.js >= 20

## How It Works

1. **Parse docs** — Markdown files are parsed into structured data (code blocks, commands, links, file paths, env vars, version claims, dependency claims, API endpoints) using remark/unified AST walking.
2. **Extract codebase facts** — The project is scanned for `package.json` scripts, Makefile targets, env var usage, route definitions, docker-compose services, version files, and the full file listing.
3. **Run analyzers** — Enabled analyzers run in parallel via `Promise.allSettled`. Each compares doc claims against codebase facts and produces `DriftIssue` objects with severity, location, message, and suggestions.
4. **Report** — Issues are assembled into a `DriftReport` and rendered in the chosen output format. The CLI exits with code `1` if any errors are found.

## License

MIT
