# Stale — Session Context

## What Is Stale

Stale is a CLI tool and GitHub Action that detects documentation drift. It cross-references what your README/docs say against what your codebase actually does and flags every discrepancy. The original spec lives in `02-docs-drift-detector.md` (originally called "DocDrift", renamed to "Stale").

---

## What Has Been Done

### Phase 0: Project Scaffolding & Shared Types — COMPLETE
- `package.json` — name `stale-cli`, type module, bin entry, all deps installed
- `tsconfig.json` — strict mode, ES2022, NodeNext modules
- `src/types.ts` — all shared types: `DriftIssue`, `DriftReport`, `DriftSummary`, `ParsedDocument`, `CodebaseFacts`, `StaleConfig`, `Analyzer`/`Reporter` interfaces, etc.
- `src/config.ts` — config loader with `.stale.yml` support, deep merge with defaults, CLI flag override
- `src/errors.ts` — custom error classes: `StaleError`, `ConfigError`, `ParseError`, `AnalyzerError`, `ApiError`
- `src/utils/similarity.ts` — Levenshtein-based fuzzy matching for "did you mean?" suggestions
- `src/utils/git.ts` — git history helpers (last modified, removal commit, blame)
- `src/utils/id.ts` — deterministic issue ID generation

### Phase 1: Parsers — COMPLETE
- `src/parsers/markdown.ts` — parses .md files into structured `ParsedDocument` using remark/unified AST walking. Extracts: code blocks, commands (npm/yarn/pnpm/npx/make), inline code, links, file paths, env vars, version claims, dependency claims, API endpoints, sections
- `src/parsers/codebase.ts` — extracts `CodebaseFacts` from source code: file listing, package.json scripts/deps/engines, Makefile targets, env var usage (process.env/os.environ), route detection (Express/Fastify/Flask patterns via regex), docker-compose services, Node version from .nvmrc/.node-version/Dockerfile
- `src/parsers/config.ts` — helpers for parsing package.json, docker-compose, version files

### Phase 2: Static Analyzers (7) — COMPLETE
All implement the `Analyzer` interface (`analyze(ctx: AnalyzerContext): Promise<DriftIssue[]>`):
1. `src/analyzers/static/commands.ts` — checks npm/yarn/make commands in docs against package.json scripts and Makefile targets. Detects jest→vitest migration artifacts.
2. `src/analyzers/static/file-paths.ts` — checks file paths referenced in docs against filesystem. Handles .js→.ts, docker-compose.yml→compose.yaml transforms.
3. `src/analyzers/static/env-vars.ts` — bidirectional check: documented vars not in code (error), code vars not in docs (warning).
4. `src/analyzers/static/urls.ts` — detects CI migration patterns (Travis/CircleCI URL + .github/workflows exists), broken relative links, optional external URL checking via HTTP HEAD.
5. `src/analyzers/static/versions.ts` — compares "requires Node X" claims against engines/nvmrc/Dockerfile using semver.
6. `src/analyzers/static/dependencies.ts` — checks "requires Redis/Postgres/etc" claims against npm deps and docker-compose services. Has a mapping of common names to npm packages.
7. `src/analyzers/static/api-routes.ts` — checks documented HTTP endpoints against code route definitions. Handles path normalization (:id vs {id}).
- `src/analyzers/registry.ts` — analyzer registry + runner with `Promise.allSettled` for resilience

### Phase 3: Reporters (4) — COMPLETE
1. `src/reporters/terminal.ts` — colored output with chalk + boxen summary box, grouped by category
2. `src/reporters/json.ts` — JSON.stringify with Set/Date handling
3. `src/reporters/markdown.ts` — GitHub-flavored markdown with summary table and collapsible `<details>` sections per category
4. `src/reporters/sarif.ts` — SARIF v2.1.0 for GitHub Code Scanning integration
- `src/reporters/index.ts` — reporter registry

### Phase 4: CLI & Orchestration — COMPLETE
- `src/cli.ts` — entry point with Commander.js, three commands: scan, init, watch
- `src/commands/scan.ts` — main pipeline: resolve config → parse docs + codebase in parallel → run analyzers → build report → render output → exit code 1 if errors
- `src/commands/init.ts` — generates .stale.yml with commented defaults
- `src/commands/watch.ts` — fs.watch with 300ms debounce, re-runs scan on changes

### Phase 5: AI Analyzers (3) — COMPLETE
- `src/analyzers/ai/client.ts` — AI SDK wrapper with retry/backoff, context builder that assembles doc sections + codebase facts for prompts
- `src/analyzers/ai/semantic.ts` — sends doc sections + code facts to AI, asks for inaccuracies. Parses structured JSON responses into DriftIssues.
- `src/analyzers/ai/completeness.ts` — asks AI what's in the codebase but missing from docs
- `src/analyzers/ai/examples.ts` — checks if code examples in docs use current patterns
- All wired into the registry and activated with `--deep` flag (requires STALE_AI_KEY)

### Phase 6: Tests — COMPLETE
- `tests/fixtures/sample-project/` — a fake project with intentional drift: wrong scripts, dead paths, stale env vars, old Node version, Travis badge, wrong endpoints
- `tests/analyzers/commands.test.ts` — 4 tests
- `tests/analyzers/file-paths.test.ts` — 3 tests
- `tests/analyzers/env-vars.test.ts` — 3 tests
- `tests/analyzers/versions.test.ts` — 3 tests
- `tests/integration/scan.test.ts` — 2 end-to-end tests
- **15 tests total, all passing**

### Phase 7: GitHub Action — COMPLETE
- `action/action.yml` — inputs: deep, fail-on, comment, config, format
- `action/index.ts` — runs scan pipeline, posts/updates PR comment via @actions/github, sets outputs, fails check based on fail-on config
- `action/Dockerfile` — Node 20 Alpine container

---

## What's Left To Do

### High Priority
- **npm publish prep**: Add `files` field to package.json (only include dist/), add `prepublishOnly` script, write a proper README.md for npm
- **README.md**: The project has no README yet. Needs: what it does, install instructions, usage examples, config reference, GitHub Action setup, screenshots of terminal output
- **Git init**: The project is not a git repository yet. Need to `git init`, make initial commit
- **Test the `--deep` flag end-to-end**: AI analyzers are built but haven't been tested with a real API key
- **Docker-compose dependency check**: The `docker-compose.dev.yml` fixture exists but the dependency analyzer doesn't pick up the `docker-compose.dev.yml` variant (only checks `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`)

### Medium Priority
- **More test coverage**: No tests yet for URLs analyzer, dependencies analyzer, API routes analyzer, reporters, parsers, or the config loader
- **Markdown reporter test with snapshot**: verify PR comment format looks good
- **SARIF validation**: validate output against the official SARIF JSON schema
- **Config override via CLI**: the `--config` flag path resolution in `resolveConfig()` could be cleaner
- **Smarter env var detection in markdown**: currently uses a regex + skip list approach which may have edge cases. Consider only flagging env vars that appear in code-block-like contexts or after specific keywords like "set", "export", "configure"
- **File path false positives**: the file path extractor may pick up URL fragments or version strings that look path-like
- **Watch command**: uses `fs.watch` with `recursive: true` which may not work on all platforms. Consider adding `chokidar` for robustness

### Low Priority / Nice to Have
- **Tree-sitter integration**: the plan called for Tree-sitter for AST-based route detection, but regex works fine for now. Tree-sitter would improve accuracy for complex route patterns
- **Historical drift tracking**: a `stale history` command that shows how drift has changed over time
- **Drift score badge**: generate a badge SVG showing documentation health
- **Slack alerts**: webhook integration for team tier
- **Web dashboard**: project overview with historical drift scores
- **Billing (Stripe)**: for the Pro/Team tiers mentioned in the spec
- **Landing page**: marketing site
- **Monorepo support**: handle workspaces with multiple package.json files
- **Python/Go/Ruby support**: env var detection works for Python already, but route detection is JS/TS focused. Could expand framework patterns
- **Inline fix suggestions**: `stale fix` command that auto-corrects simple drift (update version numbers, fix script names)

### Known Issues
- The `docker-compose.dev.yml` variant is not checked by the docker-compose parser (only the standard names)
- The `action/index.ts` uses dynamic imports for `@actions/core` and `@actions/github` which aren't installed as deps (they're provided by the GitHub Actions runtime). The action hasn't been tested in a real GitHub Actions environment.
- The action.yml `main` path points to `../dist/action/index.js` which would need adjustment for actual publishing

---

## How To Run

```bash
# From the stale/ directory:

# Run against the test fixture
npx tsx src/cli.ts scan --path tests/fixtures/sample-project

# Run tests
npm test

# Build
npm run build

# Generate config
npx tsx src/cli.ts init

# JSON output
npx tsx src/cli.ts scan --path tests/fixtures/sample-project --format json

# AI mode (needs STALE_AI_KEY env var)
npx tsx src/cli.ts scan --path tests/fixtures/sample-project --deep
```

## Tech Stack
TypeScript (strict), Commander.js, remark/unified, AI API, fast-glob, simple-git, chalk + boxen, Vitest

## File Count
27 source files, 5 test files, 8 fixture files
