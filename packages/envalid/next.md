# Envalid — Current State & What's Next

## What It Is

Envalid is a CLI tool that brings type safety to `.env` files. Define a `.env.schema` (YAML), and Envalid validates every environment against it — catching missing vars, wrong types, format mismatches, and drift between environments before they cause runtime failures.

Part of the WhenLabs toolchain at whenlabs.org.

---

## Current State (Complete)

### CLI Commands

| Command | Description | Status |
|---------|-------------|--------|
| `envalid init` | Scan existing .env, infer types, generate starter schema | Done |
| `envalid validate` | Validate .env against schema (with `--ci`, `--environment`, `--format`) | Done |
| `envalid diff` | Compare two .env files side by side | Done |
| `envalid generate-example` | Generate .env.example from schema | Done |
| `envalid sync` | Validate multiple environments at once | Done |
| `envalid onboard` | Interactive guided setup for new developers | Done |
| `envalid hook install/uninstall/status` | Git pre-commit hook management | Done |
| `envalid detect` | Scan codebase for env var usage, compare with schema | Done |

### Type Validators (11)

| Type | Constraints |
|------|------------|
| `string` | `pattern`, `minLength`, `maxLength` |
| `integer` | `range` |
| `float` | `range` |
| `boolean` | accepts `true/false/1/0` |
| `url` | `protocol` allowlist |
| `email` | basic format validation |
| `enum` | `values` array |
| `csv` | comma-separated values |
| `json` | valid JSON string |
| `path` | non-empty path |
| `semver` | semver format |

### Schema Format

YAML-based `.env.schema` with:
- Per-variable: `type`, `required`, `default`, `description`, `sensitive`, `environments`, type-specific constraints
- Groups: named collections of variables with `required_in` environment constraints
- Version field for future schema migrations

### Output Formats

- **terminal** — colored, human-readable with icons
- **json** — machine-readable for CI pipelines
- **markdown** — tables for PR comments

### Infrastructure

- GitHub Action (`action.yml`) for CI integration
- CI workflow (Node 20/22 matrix)
- npm publish workflow (triggered on GitHub release)
- cosmiconfig support (`.envalidrc`, `envalid.config.js`, `package.json#envalid`)
- Programmatic API exported from `envalid` package
- Codebase detection for Node.js, Python, Ruby, Go, Rust, PHP env var patterns

### Stack

- TypeScript (ESM)
- Commander.js (CLI framework)
- Zod v4 (schema-of-schema validation)
- yaml + dotenv (parsing)
- Chalk (terminal output)
- Inquirer (interactive prompts)
- cosmiconfig (config file discovery)
- Vitest (88 tests, all passing)
- tsup (build)

### Repo

- GitHub: https://github.com/WhenLabs-org/envalid
- License: MIT

---

## What's Next

### Near-Term (CLI Enhancements)

- **Watch mode** — `envalid watch` to continuously validate on file changes
- **PR comment bot** — auto-post validation results as PR comments via GitHub Action
- **Schema migration** — `envalid migrate` to handle schema version upgrades when the format evolves
- **Custom validators** — plugin system for user-defined types beyond the built-in 11
- **VS Code extension** — inline validation, autocomplete for `.env` files, schema-aware hover docs
- **Homebrew tap** — `brew install envalid` for macOS users

### Web Dashboard (whenlabs.org)

Part of the WhenLabs platform, not this repo. Features:

- **Team sync** — encrypted cloud storage for schemas (variables stay local, only schema + metadata syncs)
- **Environment health UI** — see validation status across all projects and environments at a glance
- **Slack/Discord notifications** — alerts when schema changes, when validation fails in CI
- **Audit log** — who changed what, when, with diffs
- **Shared schemas** — centralized schema management for teams
- **Approval workflows** — require review before production env changes go live

### Monetization

| Tier | Price | Features |
|------|-------|----------|
| Free (CLI) | $0 | Full CLI, all validators, git hooks, CI mode, GitHub Action |
| Pro | $9/mo per user | Web dashboard, team sync, Slack/Discord alerts, audit log |
| Team | $29/mo (5 users) | All Pro + shared schemas, approval workflows, production change control |

### Competitive Position

Envalid works WITH `.env` files — doesn't replace them. No infrastructure, no account, no migration. Just `npx envalid init`. The `envalid onboard` command is the killer feature that no competitor has: turns developer onboarding from a frustrating guessing game into a 2-minute guided setup.

| Competitor | Gap Envalid fills |
|------------|-------------------|
| dotenv-vault | No schema, no validation, no type checking |
| Infisical | Overkill for most teams, requires infrastructure |
| Doppler | Enterprise pricing, replaces .env entirely |
| 1Password CLI | Not developer-workflow native, no schema |
