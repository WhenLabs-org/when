# Envalid

Type safety for `.env` files. Define a schema, validate every environment against it. Catch missing vars, wrong types, format mismatches, and drift between environments before they cause runtime failures.

Part of the [WhenLabs](https://whenlabs.org) toolchain.

> **Part of the [WhenLabs toolkit](https://github.com/WhenLabs-org/when)** — install all 6 tools with one command:
> ```
> npx @whenlabs/when install
> ```

## Why envalid?

| | envalid | dotenv | Manual .env checking |
|---|---|---|---|
| Type-safe schema | YAML schema with types, ranges, patterns | No validation | Eyeball it |
| Detects undocumented vars | Scans codebase for `process.env` usage missing from schema | No detection | grep and hope |
| Validates against schema | Catches wrong types, missing vars, format mismatches | Loads vars, no validation | Compare files by hand |
| Multi-environment sync | Validates `.env`, `.env.staging`, `.env.production` together | One file at a time | Diff files manually |
| CI-ready | `--ci` flag, exit codes, JSON/Markdown output | Not designed for CI | Custom scripting |

## Install

> **Recommended:** Install the full WhenLabs toolkit with `npx @whenlabs/when install` to get envalid plus 5 other tools in one step.

```bash
npm install -g envalid
```

Or use directly with npx:

```bash
npx envalid init
```

**Requirements:** Node.js >= 20

## Quick Start

```bash
# 1. Generate a schema from your existing .env
envalid init

# 2. Validate your .env against the schema
envalid validate

# 3. Generate an up-to-date .env.example
envalid generate-example
```

## Schema Format

Create a `.env.schema` file in your project root (YAML):

```yaml
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

  STRIPE_SECRET_KEY:
    type: string
    required: true
    pattern: "^sk_(test|live)_[a-zA-Z0-9]+"
    sensitive: true
    environments: [staging, production]

  ENABLE_FEATURE_X:
    type: boolean
    required: false
    default: false

  CORS_ORIGINS:
    type: csv
    required: false
    description: "Comma-separated list of allowed CORS origins"

groups:
  payments:
    variables: [STRIPE_SECRET_KEY]
    required_in: [staging, production]
```

### Supported Types

| Type | Validates | Example |
|------|-----------|---------|
| `string` | Non-empty string, optional regex `pattern`, `minLength`, `maxLength` | `sk_test_abc123` |
| `integer` | Parseable integer, optional `range` | `3000` |
| `float` | Parseable float, optional `range` | `0.95` |
| `boolean` | `true`, `false`, `1`, `0` | `true` |
| `url` | Valid URL, optional `protocol` constraint | `postgres://localhost/db` |
| `email` | Valid email format | `admin@example.com` |
| `enum` | One of specified `values` | `development` |
| `csv` | Comma-separated values | `http://a.com,http://b.com` |
| `json` | Valid JSON string | `{"key": "value"}` |
| `path` | File/directory path | `./data/uploads` |
| `semver` | Valid semver string | `1.2.3` |

### Variable Options

| Option | Type | Description |
|--------|------|-------------|
| `type` | string | One of the supported types above (required) |
| `required` | boolean | Whether the variable must be present (default: `true`) |
| `default` | any | Default value |
| `description` | string | Human-readable description |
| `sensitive` | boolean | Mask value in output |
| `environments` | string[] | Only required in these environments |
| `pattern` | string | Regex pattern (for `string` type) |
| `range` | [min, max] | Numeric range (for `integer`/`float` types) |
| `values` | string[] | Allowed values (for `enum` type) |
| `protocol` | string[] | Allowed URL protocols (for `url` type) |
| `minLength` | number | Minimum string length |
| `maxLength` | number | Maximum string length |

### Groups

Groups let you bundle related variables and enforce that all variables in a group are present for specific environments:

```yaml
groups:
  payments:
    variables: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]
    description: "Payment processing"
    required_in: [staging, production]
```

## Commands

### `envalid init`

Scan an existing `.env` file and generate a starter `.env.schema` with inferred types. Envalid auto-detects booleans, integers, floats, URLs, emails, semver strings, JSON, CSV values, and flags sensitive-looking keys (containing `secret`, `key`, `token`, `password`, etc.).

```bash
envalid init                          # reads .env, writes .env.schema
envalid init -e .env.production       # read from a specific file
envalid init --force                  # overwrite existing schema
```

### `envalid validate`

Validate a `.env` file against the schema.

```bash
envalid validate                                    # basic validation
envalid validate --environment production           # check production requirements
envalid validate --ci                               # strict mode (warnings become errors)
envalid validate --format json                      # machine-readable output
envalid validate -s custom.schema -e .env.staging   # custom paths
```

**Exit codes:** `0` = valid, `1` = validation failed, `2` = tool error

### `envalid diff`

Compare two `.env` files side by side. When a schema is provided, sensitive values are automatically masked.

```bash
envalid diff .env .env.production
envalid diff .env .env.staging -s .env.schema    # masks sensitive values
envalid diff .env .env.production --format json
```

### `envalid sync`

Validate multiple environments against the schema at once. Environment names are inferred from file names (e.g. `.env.production` -> `production`).

```bash
envalid sync --environments .env,.env.staging,.env.production
envalid sync --environments .env,.env.production --ci
```

### `envalid generate-example`

Generate an `.env.example` file from the schema with descriptions, defaults, and type-appropriate placeholders.

```bash
envalid generate-example                    # writes .env.example
envalid generate-example -o .env.template   # custom output path
```

### `envalid onboard`

Interactive guided setup for new developers. Walks through each required variable, explains what it is, validates input in real-time, and writes a `.env` file. Enum types get a selection list; sensitive values use masked input.

```bash
envalid onboard
envalid onboard -s custom.schema -o .env.local
```

### `envalid detect`

Scan your codebase for environment variable usage and compare with the schema. Finds variables referenced in code but missing from the schema, and schema variables not used in code.

```bash
envalid detect                          # scan current directory
envalid detect -d src                   # scan specific directory
envalid detect --exclude vendor,tmp     # exclude directories

# Auto-generate a schema from detected env vars in code
envalid detect --generate

# Generate schema to a custom path
envalid detect --generate -o custom.schema
```

The `--generate` flag scans your codebase for `process.env` (and equivalents), infers types, and writes a `.env.schema` — useful for projects that don't have a schema yet.

Supports: `process.env.X` (Node.js), `import.meta.env.X` (Vite), `os.environ` / `os.getenv` (Python), `ENV[]` (Ruby), `os.Getenv` (Go), `env::var` (Rust), `getenv` / `$_ENV` (PHP).

**file:line references** -- `envalid detect` now shows exactly where each undocumented variable is used:

```
  REDIS_URL (missing from schema)
    src/cache.ts:14
    src/workers/queue.ts:7
```

### `envalid secrets`

Scan your codebase for hardcoded API keys, tokens, and passwords. Reports `file:line` locations but redacts actual values to keep output safe for logs.

```bash
envalid secrets                       # scan current directory
envalid secrets -d src                # scan specific directory
```

```
  src/config.ts:23    STRIPE_KEY = "sk_live_••••••••"
  src/email.ts:5      SENDGRID_TOKEN = "SG.••••••••"
```

### Smart Type Inference

`envalid init` now infers richer types from `.env` values:

- Empty or missing values are marked `required: false` (optional)
- `PORT`, `*_PORT` variables get `type: port` with range `[1, 65535]`
- `"true"` / `"false"` values are inferred as `type: boolean`
- URL-shaped values are inferred as `type: url`

### `envalid hook`

Manage git pre-commit hooks for automatic validation. The hook runs `envalid validate --ci` before each commit and blocks the commit on failure.

```bash
envalid hook install      # install pre-commit hook
envalid hook uninstall    # remove pre-commit hook
envalid hook status       # check if hook is installed
```

Works with custom `core.hooksPath` configurations (e.g. Husky).

## CI Integration

### GitHub Action

```yaml
name: Environment Validation
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: WhenLabs-org/envalid@v1
        with:
          schema: .env.schema
          environment: production
          fail-on-warning: true
```

#### Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `schema` | `.env.schema` | Path to schema file |
| `env-file` | `.env` | Path to .env file to validate |
| `environment` | | Target environment (e.g. production) |
| `format` | `terminal` | Output format: terminal, json, markdown |
| `fail-on-warning` | `false` | Treat warnings as errors |
| `node-version` | `20` | Node.js version to use |

### Generic CI

```bash
npx envalid validate --ci --environment production
```

The `--ci` flag makes warnings into errors and returns exit code `1` on any issue.

## Output Formats

Use `--format` to control output:

- **terminal** (default) -- colored, human-readable with icons
- **json** -- machine-readable for CI pipelines
- **markdown** -- tables for PR comments

## Configuration

Configure defaults via `.envalidrc`, `.envalidrc.json`, `envalid.config.js`, or `package.json#envalid`:

```json
{
  "schema": ".env.schema",
  "env": ".env",
  "format": "terminal",
  "ci": false,
  "exclude": ["vendor", "tmp"]
}
```

CLI flags always override config file values.

## Programmatic API

```typescript
import { parseSchemaFile, readEnvFile, validate } from "envalid";

const schema = parseSchemaFile(".env.schema");
const envFile = readEnvFile(".env");
const result = validate(schema, envFile, { environment: "production" });

console.log(result.valid);    // true/false
console.log(result.issues);   // ValidationIssue[]
console.log(result.stats);    // { total, valid, errors, warnings, missing }
```

All CLI functionality is available as importable functions:

```typescript
import {
  // Schema
  parseSchemaFile, parseSchemaString, validateValue,
  // Validation
  validate, diffEnvFiles, syncCheck,
  // Env files
  readEnvFile, parseEnvString, detectEnvUsage,
  // Generation
  generateExample, inferType, generateSchema,
  // Reporting
  createReporter,
  // Git hooks
  installHook, uninstallHook, isHookInstalled, getGitRoot,
  // Config
  loadConfig, mergeOptions,
  // Utilities
  maskValue,
} from "envalid";
```

Full TypeScript types are exported for `EnvSchema`, `VariableSchema`, `ValidationResult`, `ValidationIssue`, `DiffResult`, `Reporter`, `EnvFile`, `DetectionResult`, and more.

## Project Structure

```
envalid/
├── src/
│   ├── cli.ts                # Commander.js entry point
│   ├── index.ts              # Public API exports
│   ├── config.ts             # cosmiconfig-based config loading
│   ├── errors.ts             # Custom error classes
│   ├── commands/
│   │   ├── validate.ts       # Core validation logic
│   │   ├── init.ts           # Schema generation from .env
│   │   ├── diff.ts           # Cross-environment comparison
│   │   ├── sync.ts           # Multi-environment sync check
│   │   ├── generate.ts       # .env.example generation
│   │   ├── onboard.ts        # Interactive developer setup
│   │   └── hook.ts           # Git hook management
│   ├── schema/
│   │   ├── types.ts          # TypeScript type definitions
│   │   ├── parser.ts         # YAML schema parser (Zod-validated)
│   │   └── validators.ts     # Per-type validation functions
│   ├── env/
│   │   ├── reader.ts         # .env file reader (dotenv)
│   │   ├── writer.ts         # .env file writer (with quoting)
│   │   └── detector.ts       # Codebase env var usage scanner
│   ├── reporters/
│   │   ├── index.ts          # Reporter factory
│   │   ├── terminal.ts       # Colored terminal output
│   │   ├── json.ts           # JSON output for CI
│   │   └── markdown.ts       # Markdown tables for PRs
│   └── utils/
│       ├── git.ts            # Git hook install/uninstall
│       └── crypto.ts         # Sensitive value masking
├── tests/                    # Vitest test suite
├── action.yml                # GitHub Action definition
├── tsconfig.json
├── tsup.config.ts            # Build config (ESM, Node 20)
└── vitest.config.ts
```

## Tech Stack

- **TypeScript** (ESM, targeting ES2022)
- **Commander.js** -- CLI framework
- **Zod v4** -- schema-of-schema validation
- **yaml** + **dotenv** -- file parsing
- **Chalk** -- colored terminal output
- **Inquirer** -- interactive prompts
- **Ora** -- spinners
- **cosmiconfig** -- config file discovery
- **tsup** -- build tooling
- **Vitest** -- test framework

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode (rebuild on changes)
npm run dev

# Run tests
npm test

# Run tests once
npm run test:run

# Type check
npm run lint
```

## License

MIT
