# DocDrift — README & Docs Drift Detector

## What We're Building

DocDrift is a CLI tool and GitHub Action that detects when your documentation has gone stale. It cross-references what your README, CONTRIBUTING.md, API docs, and code comments *say* against what your codebase *actually does* — and flags every lie.

---

## The Core Problem

Documentation rots. Silently. Constantly. And nobody notices until a user or new teammate follows the instructions and everything breaks.

Specific failure modes:

- **Dead commands**: README says `npm run dev` but the script was renamed to `dev:server` 4 months ago.
- **Wrong file paths**: Docs reference `src/config/database.js` but the file was moved to `lib/db/connection.ts` during a refactor.
- **Phantom endpoints**: API docs describe `POST /api/users` with a `username` field, but the schema now requires `email` instead and `username` was removed.
- **Stale install steps**: CONTRIBUTING.md says "requires Node 16+" but the project now uses Node 20 features and has `engines: { "node": ">=20" }` in package.json.
- **Ghost dependencies**: README lists `Redis` as a prerequisite but Redis was replaced with an in-memory cache 2 releases ago.
- **Outdated badges/links**: Coverage badge still points to a Travis CI build that moved to GitHub Actions a year ago.
- **Wrong environment variables**: Docs say to set `MONGO_URI` but the codebase uses `DATABASE_URL`.

The fundamental issue: docs are written by humans at a point in time, then the code changes and nobody updates the docs. There is no automated feedback loop.

---

## How It Works

### 1. Static Analysis Layer (No AI, Fast, Free)

DocDrift first does deterministic checks that don't require an LLM:

```bash
$ docdrift scan

Scanning project: my-app/
Analyzing: README.md, CONTRIBUTING.md, docs/api.md, docs/setup.md

── Static Checks ──────────────────────────────────────────

COMMANDS (checking against package.json scripts)
  ✗ README.md:42 — `npm run build` → script "build" not found
    Available scripts: build:client, build:server, build:all
    Suggestion: did you mean `npm run build:all`?

  ✗ CONTRIBUTING.md:18 — `npm test` → script "test" exists ✓
    BUT: script calls `jest` which is not in devDependencies
    (vitest is installed instead — likely a migration artifact)

FILE PATHS (checking against filesystem)
  ✗ README.md:67 — references `src/config/database.js`
    File does not exist.
    Similar: src/config/database.ts (renamed?)

  ✗ docs/setup.md:23 — references `docker-compose.yml`
    File does not exist.
    Similar: docker-compose.dev.yml, compose.yaml

ENVIRONMENT VARIABLES (checking against codebase usage)
  ✗ README.md:89 — documents `MONGO_URI`
    Not found in codebase. Found `DATABASE_URL` used in 4 files.

  ⚠ docs/setup.md:34 — documents `API_KEY`
    Found in codebase but also found `API_SECRET` (undocumented, used in 2 files)

URLS & LINKS
  ✗ README.md:5 — badge links to https://travis-ci.org/user/repo
    .github/workflows/ directory exists — likely migrated to GitHub Actions

  ⚠ README.md:12 — links to https://docs.example.com/v2/api
    Cannot verify (external URL, not checked by default)

NODE/RUNTIME VERSION
  ✗ CONTRIBUTING.md:7 — says "requires Node.js 16 or higher"
    package.json engines: { "node": ">=20.0.0" }
    .nvmrc: 20.11.0

DEPENDENCIES
  ⚠ README.md:31 — lists "Redis" as a prerequisite
    No redis client found in dependencies (removed?)
    Last seen in git log: removed in commit a3f2c1d (2024-09-15)

── Summary ──────────────────────────────────────────────
  5 errors (docs contradict codebase)
  3 warnings (potential issues, needs human review)
  14 checks passed
```

### 2. AI Analysis Layer (Claude API, Deeper, Paid)

For paid users, DocDrift sends relevant doc + code snippets to Claude for semantic analysis:

```bash
$ docdrift scan --deep

── AI Analysis (powered by Claude) ───────────────────────

SEMANTIC DRIFT
  ⚠ README.md:55-70 — "Getting Started" section describes a 3-step setup
    but the actual setup now requires 5 steps (missing: database migration,
    seed data). The install command is correct but incomplete.

  ⚠ docs/api.md:120 — POST /api/users documentation says:
    "Returns 201 with the created user object"
    Actual handler (src/routes/users.ts:45) returns 200, not 201.
    Response shape also differs: docs show `{ user: {...} }`
    but code returns `{ data: { user: {...} }, meta: {...} }`

ARCHITECTURE DRIFT
  ⚠ README.md:15 — describes the project as "a REST API built with Express"
    but the codebase uses Fastify (package.json: "fastify": "^4.x").
    26 references to "Express" in documentation, 0 in code.

OUTDATED EXAMPLES
  ⚠ docs/examples/auth.md:30 — code example uses callback-style:
    `db.query(sql, function(err, result) {...})`
    Codebase uses async/await exclusively. Example will confuse users.
```

### 3. Output Formats

```bash
# Terminal (default) — pretty, colored output
docdrift scan

# JSON — for CI pipelines
docdrift scan --format json

# Markdown — for PR comments
docdrift scan --format markdown

# SARIF — for GitHub Code Scanning integration
docdrift scan --format sarif

# GitHub PR comment (via Action)
# Automatically posts drift report as a PR comment
```

### 4. GitHub Action

```yaml
# .github/workflows/docdrift.yml
name: Documentation Drift Check
on:
  pull_request:
    paths:
      - '**.md'
      - 'package.json'
      - 'src/**'
      - 'docs/**'

jobs:
  docdrift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docdrift/action@v1
        with:
          deep: true  # Enable AI analysis (requires ANTHROPIC_API_KEY)
          fail-on: error  # Fail PR if errors found (not warnings)
          comment: true  # Post results as PR comment
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## Technical Architecture

### What Gets Checked (Static Layer)

| Check Type | Source (Docs) | Target (Code) | Method |
|-----------|---------------|----------------|--------|
| CLI commands | Markdown code blocks with `npm`, `yarn`, `pnpm`, `npx` | `package.json` scripts, `Makefile` targets | Exact match + fuzzy |
| File paths | Any path-like string in docs | Filesystem `fs.existsSync` | Exact + similarity |
| Env vars | Documented env vars | `process.env.X` / `os.environ` grep | AST or regex |
| URLs | Inline links, badge URLs | HTTP HEAD check (optional) | Request |
| Runtime versions | "requires Node X" text | `engines`, `.nvmrc`, `.node-version`, `Dockerfile` | Parse + compare |
| Dependencies | "requires Redis/Postgres/etc" | `package.json`, `docker-compose.yml`, `requirements.txt` | Name match |
| API endpoints | Documented routes + methods | Route definitions in code (Express/Fastify/Flask patterns) | AST or regex |
| Config files | Referenced config filenames | Filesystem | Exact match |

### What Gets Checked (AI Layer)

| Check Type | What Claude Analyzes |
|-----------|---------------------|
| Semantic accuracy | Does the doc description match what the code actually does? |
| Completeness | Are there setup steps, config options, or features missing from docs? |
| Example freshness | Do code examples use current patterns/APIs from the codebase? |
| Architecture claims | Does "built with X" match the actual tech stack? |
| Response shapes | Do documented API responses match actual handler return values? |

### Stack

```
Language:       TypeScript
CLI framework:  Commander.js
Markdown parser: remark / unified (parse MD into AST, extract code blocks, links, paths)
Code analysis:  Tree-sitter (multi-language AST parsing for route detection)
                Simple regex fallback for env var detection
AI:             Anthropic Claude API (sonnet for speed, opus for deep analysis)
File matching:  fast-glob for filesystem traversal
Git:            simple-git for blame/history analysis
Output:         Chalk + boxen for terminal, Handlebars for markdown templates
Package:        npm (CLI), GitHub Marketplace (Action)
Testing:        Vitest with snapshot tests for report output
```

### Project Structure

```
docdrift/
├── src/
│   ├── cli.ts                    # Entry point
│   ├── commands/
│   │   ├── scan.ts               # Main scan command
│   │   ├── init.ts               # Generate config file
│   │   └── watch.ts              # Watch mode for local dev
│   ├── analyzers/
│   │   ├── static/
│   │   │   ├── commands.ts       # Check CLI commands against package.json
│   │   │   ├── file-paths.ts     # Check referenced file paths exist
│   │   │   ├── env-vars.ts       # Check env var names match codebase
│   │   │   ├── urls.ts           # Check URLs are reachable
│   │   │   ├── versions.ts       # Check runtime version claims
│   │   │   ├── dependencies.ts   # Check prerequisite claims
│   │   │   └── api-routes.ts     # Check documented API endpoints
│   │   └── ai/
│   │       ├── semantic.ts       # Claude-powered semantic drift detection
│   │       ├── completeness.ts   # Missing documentation detection
│   │       └── examples.ts       # Code example freshness check
│   ├── parsers/
│   │   ├── markdown.ts           # Extract structured data from .md files
│   │   ├── codebase.ts           # Extract facts from source code
│   │   └── config.ts             # Parse package.json, docker-compose, etc.
│   ├── reporters/
│   │   ├── terminal.ts           # Pretty CLI output
│   │   ├── json.ts               # JSON for CI
│   │   ├── markdown.ts           # PR comment format
│   │   └── sarif.ts              # GitHub Code Scanning format
│   └── utils/
│       ├── similarity.ts         # Fuzzy path/name matching
│       └── git.ts                # Git history for "when did this change?"
├── action/
│   ├── action.yml                # GitHub Action definition
│   └── Dockerfile                # Action container
├── tests/
│   ├── fixtures/                 # Sample projects with intentional drift
│   └── analyzers/                # Unit tests per analyzer
├── package.json
└── README.md
```

---

## Build Plan (Solo, Claude Code)

### Week 1: Static Analysis Core

- Day 1: Project setup, markdown parser (extract code blocks, links, file paths from .md)
- Day 2: Commands checker — parse package.json scripts, match against documented commands
- Day 3: File paths checker — extract path-like strings from docs, verify against filesystem
- Day 4: Env vars checker — grep codebase for env var usage, compare with documented vars
- Day 5: Version checker — compare "requires Node X" with package.json engines
- Day 6: Reporter — pretty terminal output with colors, line numbers, suggestions
- Day 7: CLI structure, `docdrift scan` command, JSON output mode

### Week 2: Polish + GitHub Action

- Day 1: Dependency/prerequisite checker (Redis, Postgres, etc.)
- Day 2: URL/link checker (optional HTTP HEAD requests)
- Day 3: Fuzzy matching — suggest corrections ("did you mean build:all?")
- Day 4: GitHub Action — Dockerfile, action.yml, PR comment posting
- Day 5: Config file support (.docdrift.yml — ignore patterns, custom checks)
- Day 6-7: Tests, documentation, npm publish, landing page

### Week 3: AI Layer (Paid Tier)

- Day 1-2: Claude integration — send doc+code snippets for semantic analysis
- Day 3: API route drift — match documented endpoints against actual route handlers
- Day 4: Code example freshness — detect outdated patterns in doc examples
- Day 5: Web dashboard — project overview, historical drift score, badge generation
- Day 6-7: Billing (Stripe), API key management, rate limiting

---

## Monetization

| Tier | Price | Features |
|------|-------|----------|
| Free (CLI) | $0 | All static checks, terminal + JSON output, unlimited local use |
| Free (Action) | $0 | Static checks on public repos, PR comments |
| Pro | $12/mo | AI-powered deep analysis, private repos, SARIF output |
| Team | $39/mo (5 users) | Dashboard, historical tracking, drift score badge, Slack alerts |
| Open Source | Free | Full Pro features for public repos with 100+ stars |

---

## Why Nobody Has Built This

1. **It's not sexy.** "Documentation checker" sounds like a linter nobody asked for.
2. **It's cross-domain.** You need to parse Markdown AND understand code structure AND do fuzzy matching. Most tools stay in one lane.
3. **False positives are tricky.** Docs intentionally simplify — "run npm start" when the actual command has flags. You need smart heuristics, not just string matching.
4. **The market seems small.** But every project with >1 contributor has this problem. Every open source maintainer loses hours to stale-doc issues.

The timing is perfect: AI coding tools are generating code faster than ever, which means docs drift faster than ever. The gap between what the README says and what the code does is widening, not shrinking.
