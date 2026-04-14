# Envalid

Type safety for `.env` files. Define a schema, validate every environment against it. Catch missing vars, wrong types, format mismatches, and drift between environments before they cause runtime failures.

## Install

```bash
npm install -g envalid
```

Or use directly with npx:

```bash
npx envalid init
```

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

Create a `.env.schema` file in your project root:

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

## Commands

### `envalid init`

Scan an existing `.env` file and generate a starter `.env.schema` with inferred types.

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

Compare two `.env` files side by side.

```bash
envalid diff .env .env.production
envalid diff .env .env.staging -s .env.schema    # masks sensitive values
envalid diff .env .env.production --format json
```

### `envalid sync`

Validate multiple environments against the schema at once.

```bash
envalid sync --environments .env,.env.staging,.env.production
envalid sync --environments .env,.env.production --ci
```

### `envalid generate-example`

Generate an `.env.example` file from the schema with descriptions and defaults.

```bash
envalid generate-example                    # writes .env.example
envalid generate-example -o .env.template   # custom output path
```

### `envalid onboard`

Interactive guided setup for new developers. Walks through each required variable, explains what it is, validates input in real-time, and writes a `.env` file.

```bash
envalid onboard
```

### `envalid detect`

Scan your codebase for environment variable usage and compare with the schema. Finds variables referenced in code but missing from the schema, and schema variables not used in code.

```bash
envalid detect                          # scan current directory
envalid detect -d src                   # scan specific directory
envalid detect --exclude vendor,tmp     # exclude directories
```

Supports: `process.env.X` (Node.js), `import.meta.env.X` (Vite), `os.environ` / `os.getenv` (Python), `ENV[]` (Ruby), `os.Getenv` (Go), `env::var` (Rust), `getenv` / `$_ENV` (PHP).

### `envalid hook`

Manage git pre-commit hooks for automatic validation.

```bash
envalid hook install      # install pre-commit hook
envalid hook uninstall    # remove pre-commit hook
envalid hook status       # check if hook is installed
```

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
```

### Generic CI

```bash
npx envalid validate --ci --environment production
```

The `--ci` flag makes warnings into errors and returns exit code `1` on any issue.

## Output Formats

Use `--format` to control output:

- **terminal** (default) — colored, human-readable
- **json** — machine-readable for CI pipelines
- **markdown** — tables for PR comments

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

## License

MIT
