# EnvGuard — .env Schema Validator + Sync

## What We're Building

EnvGuard is a CLI tool (and optional web dashboard) that brings type safety to environment variables. It works like TypeScript for .env files — you define a schema, and the tool validates every environment against it. It catches missing vars, wrong types, format mismatches, and drift between environments before they cause runtime failures.

---

## The Core Problem

Every project has a .env file. None of them have a contract. The result:

- A new developer joins, clones the repo, runs the app, and it crashes because they're missing `STRIPE_SECRET_KEY`. Nobody told them. The `.env.example` file is 6 months out of date.
- Someone pushes a feature that requires `REDIS_URL`. It works in staging because someone manually added it. Production goes down at 2 AM because nobody added it there.
- A variable called `DEBUG` is set to `"true"` (string). The code checks `if (process.env.DEBUG)` which is truthy for any non-empty string, including `"false"`. Silent bugs.
- `.env.example` says `DATABASE_URL=postgres://...` but half the team is using `DB_URL` because an old migration script used that name. Both work in different parts of the codebase.

The core insight: .env files are the only config surface in modern development that has zero type checking, zero validation, and zero sync tooling that developers actually use.

---

## How It Works

### 1. Schema Definition (`.env.schema`)

A developer creates a `.env.schema` file in their project root. This is a simple, human-readable format:

```yaml
# .env.schema
version: 1

variables:
  NODE_ENV:
    type: enum
    values: [development, staging, production, test]
    required: true
    default: development
    description: "Application environment"

  PORT:
    type: integer
    required: true
    default: 3000
    range: [1024, 65535]
    description: "HTTP server port"

  DATABASE_URL:
    type: url
    required: true
    protocol: [postgres, postgresql]
    description: "PostgreSQL connection string"
    sensitive: true

  REDIS_URL:
    type: url
    required: false
    protocol: [redis, rediss]
    description: "Redis connection string (optional, enables caching)"
    sensitive: true

  STRIPE_SECRET_KEY:
    type: string
    required: true
    pattern: "^sk_(test|live)_[a-zA-Z0-9]+"
    description: "Stripe API secret key"
    sensitive: true
    environments: [staging, production]

  LOG_LEVEL:
    type: enum
    values: [debug, info, warn, error]
    required: false
    default: info

  ENABLE_FEATURE_X:
    type: boolean
    required: false
    default: false
    description: "Toggle for feature X (dark launch)"

  API_RATE_LIMIT:
    type: integer
    required: false
    default: 100
    range: [1, 10000]

  CORS_ORIGINS:
    type: csv
    required: false
    description: "Comma-separated list of allowed CORS origins"

groups:
  database:
    variables: [DATABASE_URL, REDIS_URL]
    description: "Data store connections"

  payments:
    variables: [STRIPE_SECRET_KEY]
    description: "Payment processing"
    required_in: [staging, production]
```

### 2. CLI Commands

```bash
# Initialize — scans existing .env and generates a starter schema
envguard init

# Validate — checks current .env against schema
envguard validate
# Output:
# ✓ NODE_ENV: "development" (valid enum value)
# ✓ PORT: 3000 (valid integer, in range)
# ✓ DATABASE_URL: valid url, postgres protocol
# ✗ STRIPE_SECRET_KEY: missing (required in production)
# ✗ API_RATE_LIMIT: "abc" is not a valid integer
# ⚠ UNKNOWN_VAR: exists in .env but not in schema

# Diff — compare two environments
envguard diff .env .env.production
# Output:
# + STRIPE_SECRET_KEY (in production, not in local)
# ~ DATABASE_URL (different values — expected)
# - DEBUG (in local, not in production — OK, not required)
# ✗ NEW_FEATURE_FLAG (in local, required, missing in production)

# Onboard — interactive setup for new developers
envguard onboard
# Walks through each required variable, explains what it is,
# prompts for values, validates in real-time, writes .env

# Sync check — verify all environments have what they need
envguard sync --environments .env,.env.staging,.env.production

# Generate — create .env.example from schema (always up to date)
envguard generate-example

# CI mode — exit code 1 on any validation failure
envguard validate --ci --environment production
```

### 3. Git Hook Integration

```bash
# Install pre-commit hook
envguard hook install

# On every commit, automatically:
# 1. Validates .env against schema
# 2. Checks if schema has new vars not in .env.example
# 3. Warns if .env.example is out of date
# 4. Blocks commit if required vars would be missing
```

### 4. GitHub Action

```yaml
# .github/workflows/env-check.yml
name: Environment Validation
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: envguard/action@v1
        with:
          schema: .env.schema
          environment: production
          fail-on-warning: true
```

---

## Technical Architecture

### CLI Stack

```
Language:       TypeScript (compiled to standalone binary via pkg or bun build)
Package:        npm (primary), homebrew tap (secondary)
Parser:         Custom YAML parser for .env.schema, dotenv for .env files
Validation:     Zod internally for schema validation logic
Output:         Chalk for colored terminal output, ora for spinners
Config:         cosmiconfig for finding .envguard config
Testing:        Vitest
```

### Project Structure

```
envguard/
├── src/
│   ├── cli.ts              # Commander.js entry point
│   ├── commands/
│   │   ├── init.ts          # Generate schema from existing .env
│   │   ├── validate.ts      # Core validation logic
│   │   ├── diff.ts          # Cross-environment comparison
│   │   ├── onboard.ts       # Interactive new-dev setup
│   │   ├── sync.ts          # Multi-environment sync check
│   │   ├── generate.ts      # Generate .env.example from schema
│   │   └── hook.ts          # Git hook management
│   ├── schema/
│   │   ├── parser.ts        # Parse .env.schema files
│   │   ├── types.ts         # Type definitions for schema
│   │   └── validators.ts    # Individual type validators (url, enum, int, etc.)
│   ├── env/
│   │   ├── reader.ts        # Read and parse .env files
│   │   ├── writer.ts        # Write .env files safely
│   │   └── detector.ts      # Auto-detect env var usage in codebase
│   ├── reporters/
│   │   ├── terminal.ts      # Pretty CLI output
│   │   ├── json.ts          # Machine-readable output for CI
│   │   └── markdown.ts      # PR comment format
│   └── utils/
│       ├── git.ts           # Git hook utilities
│       └── crypto.ts        # Sensitive value masking
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

### Type Validators

Each schema type maps to a validation function:

| Type | Validates | Example |
|------|-----------|---------|
| `string` | Non-empty string, optional regex pattern | `sk_test_abc123` |
| `integer` | Parseable integer, optional range | `3000` |
| `float` | Parseable float, optional range | `0.95` |
| `boolean` | `true`, `false`, `1`, `0` | `true` |
| `url` | Valid URL, optional protocol constraint | `postgres://...` |
| `email` | Valid email format | `admin@example.com` |
| `enum` | One of specified values | `development` |
| `csv` | Comma-separated values, optional item type | `http://a.com,http://b.com` |
| `json` | Valid JSON string | `{"key": "value"}` |
| `path` | File/directory path, optional existence check | `./data/uploads` |
| `semver` | Valid semver string | `1.2.3` |

---

## Build Plan (Solo, Claude Code)

### Week 1: Core CLI

- Day 1-2: Project scaffolding, schema parser, type definitions
- Day 3-4: Validation engine — all type validators, error reporting
- Day 5: `init` command — scan .env, infer types, generate starter schema
- Day 6: `validate` and `diff` commands with pretty terminal output
- Day 7: `generate-example` command, JSON output mode for CI

### Week 2: Developer Experience

- Day 1-2: `onboard` command — interactive walkthrough with prompts
- Day 3: Git hook integration (pre-commit)
- Day 4: GitHub Action (Dockerfile + action.yml)
- Day 5: Auto-detect env var usage (grep codebase for `process.env.X`, `os.environ`, etc.)
- Day 6-7: Tests, docs, npm publish, landing page

### Week 3: Paid Tier (Web Dashboard)

- Team sync via encrypted cloud storage (variables stay encrypted, only schema + metadata syncs)
- Web UI showing environment health across projects
- Slack/Discord notifications when schema changes
- Audit log of who changed what

---

## Monetization

| Tier | Price | Features |
|------|-------|----------|
| Free (CLI) | $0 | Full CLI, local validation, git hooks, CI mode |
| Pro | $9/mo per user | Web dashboard, team sync, Slack alerts, audit log |
| Team | $29/mo (5 users) | All Pro + shared schemas, approval workflow for production changes |

---

## Competitive Landscape

| Tool | What It Does | Gap |
|------|-------------|-----|
| dotenv-vault | Encrypted .env sync | No schema, no validation, no type checking |
| env-sentinel | Basic validation | Limited types, no diff, no onboard, no CI action |
| Infisical | Full secrets manager | Overkill for most teams, requires infrastructure |
| Doppler | Secrets management platform | Enterprise pricing, replaces .env entirely |
| 1Password CLI | Secret injection | Not developer-workflow native, no schema |

EnvGuard's wedge: it works WITH .env files (doesn't replace them), adds the missing type safety layer, and is a 30-second install. No infrastructure, no account, no migration. Just `npx envguard init`.

---

## Key Differentiator

The `envguard onboard` command is the killer feature. When a new developer joins:

```bash
$ npx envguard onboard

Welcome to project-name! Let's set up your environment.

This project requires 12 environment variables.
7 have defaults, 5 need your input.

[1/5] DATABASE_URL (required)
  → PostgreSQL connection string
  → Format: postgres://user:pass@host:port/dbname
  → Ask your team lead for dev database credentials
  > postgres://dev:dev@localhost:5432/myapp
  ✓ Valid PostgreSQL URL

[2/5] STRIPE_SECRET_KEY (required in staging/production, optional locally)
  → Stripe API secret key (starts with sk_test_ or sk_live_)
  → Get a test key at https://dashboard.stripe.com/apikeys
  → Skip for now? (y/n): y
  ⚠ Skipped — payment features will be disabled locally

...

✓ .env file created with 12 variables
✓ 7 defaults applied, 4 configured, 1 skipped
⚠ 1 skipped variable — run `envguard validate` to check later
```

No other tool does this. It turns the worst part of developer onboarding into a 2-minute guided setup.
