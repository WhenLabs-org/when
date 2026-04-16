# Vow

Scan your project's entire dependency tree, resolve the license for every package, and validate them against a policy you define in plain English. Outputs a pass/fail report suitable for CI, PR comments, and legal review.

Part of the [WhenLabs](https://whenlabs.org) umbrella.

> **Part of the [WhenLabs toolkit](https://github.com/WhenLabs-org/when)** — install all 6 tools with one command:
> ```
> npx @whenlabs/when install
> ```

## Why vow?

| | vow | license-checker | Manually checking |
|---|---|---|---|
| Plain-English policies | Write rules in natural language, Claude parses them | JSON config with SPDX IDs | No policy enforcement |
| Scans transitive deps | Full dependency tree via `package-lock.json` | Direct deps only by default | Impractical at scale |
| CI-ready with SARIF | Exit codes, JSON/CSV/Markdown/SARIF output | JSON/CSV output | Custom scripting |
| Fix suggestions | Queries npm for permissively-licensed alternatives | No suggestions | Manual research |
| Dependency graph | Cycle detection, depth calculation, path-to-root tracing | Flat list | No visibility |

## Features

- **Full dependency tree scanning** -- Parses `package-lock.json` (v1/v2/v3), handles scoped packages, workspaces, bundled deps, and dev/prod/peer/optional classification
- **6-step license resolution chain:**
  1. Package metadata (`license` field in package.json)
  2. SPDX expression parsing (`(MIT OR Apache-2.0)`)
  3. LICENSE file detection (LICENSE, LICENCE, COPYING variants)
  4. TF-IDF text classifier (local, no API -- covers ~20 common licenses)
  5. Registry API fallback (planned)
  6. AI fallback via Claude (planned)
- **Plain-English policy engine** -- Describe your license policy in natural language. Claude API parses it into structured rules, cached with SHA-256 hash and 30-day TTL
- **First-match-wins rule evaluator** -- Supports SPDX OR/AND legal semantics, scope filtering (dev/prod), package-level overrides
- **Dependency graph** -- Directed graph with cycle detection, BFS depth calculation, path-to-root tracing
- **5 output formats** -- Terminal (colored tables), JSON, CSV, Markdown, SARIF (GitHub Code Scanning)
- **Fix suggestions** -- Queries the npm registry for permissively-licensed alternatives to policy violations
- **Policy enforcement via `.vow.json`** -- Define `allow`, `deny`, and `warn` license lists in a simple JSON file. `vow check` exits 1 on denied licenses, making it a drop-in CI gate:
  ```json
  { "allow": ["MIT", "ISC", "Apache-2.0"], "deny": ["GPL-3.0"], "warn": ["LGPL-*"] }
  ```
  ```bash
  vow check   # exits 1 if any dependency has a denied license
  ```
- **UNKNOWN license resolution** -- Automatically resolves packages with unknown licenses by reading their `LICENSE` / `LICENCE` / `COPYING` files directly from `node_modules`
- **`vow attribution`** -- Generates a `THIRD_PARTY_LICENSES.md` file containing every dependency's name, version, license identifier, and full license text:
  ```bash
  vow attribution                     # all deps
  vow attribution --production        # production deps only
  vow attribution -o NOTICES.md       # custom output path
  ```

## Installation

> **Recommended:** Install the full WhenLabs toolkit with `npx @whenlabs/when install` to get vow plus 5 other tools in one step.

```bash
npm install -g vow
```

Or run directly:

```bash
npx vow scan
```

Requires Node.js >= 18.

## Quick Start

```bash
# Scan your project and see a license summary
vow scan

# Generate a starter policy file
vow init

# Validate dependencies against your policy
vow check
```

## Commands

### `vow scan`

Scan dependencies and output a license summary.

```bash
vow scan                          # Scan current directory
vow scan -p ./my-project          # Scan a specific project
vow scan --production             # Skip devDependencies
vow scan -f json -o report.json   # Output as JSON to a file
vow scan -d 3                     # Limit dependency depth
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <dir>` | Project directory | `.` |
| `-d, --depth <n>` | Max dependency depth | unlimited |
| `--production` | Skip devDependencies | `false` |
| `-f, --format <fmt>` | `terminal`, `json`, `csv`, `markdown` | `terminal` |
| `-o, --output <file>` | Write output to file | stdout |

### `vow check`

Validate licenses against a plain-English policy defined in `.vow.yml`.

```bash
vow check                              # Check against .vow.yml
vow check --policy custom-policy.yml   # Use a custom policy file
vow check --ci                         # Exit code 1 on violations
vow check --fail-on warn               # Fail on warnings too
vow check -f github                    # GitHub Actions annotation format
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <dir>` | Project directory | `.` |
| `--policy <file>` | Policy file | `.vow.yml` |
| `--ci` | CI mode (exit 1 on violations) | `false` |
| `--fail-on <level>` | `block` or `warn` | `block` |
| `--api-key <key>` | Anthropic API key | `$ANTHROPIC_API_KEY` |
| `-f, --format <fmt>` | `terminal`, `json`, `github`, `markdown` | `terminal` |
| `--production` | Skip devDependencies | `false` |
| `-o, --output <file>` | Write output to file | stdout |

### `vow init`

Generate a starter `.vow.yml` policy file.

```bash
vow init                        # Commercial template (default)
vow init -t opensource          # Open source template
vow init -t strict              # Strict template
vow init --force                # Overwrite existing file
```

**Templates:**

- **commercial** -- Allows permissive licenses and LGPL, blocks GPL/AGPL, blocks unknown
- **opensource** -- Allows permissive + LGPL/MPL, warns on GPL, blocks AGPL
- **strict** -- Allows only MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause; blocks everything else

### `vow tree`

Display the dependency tree with license annotations.

```bash
vow tree                         # Full tree
vow tree --filter agpl           # Show only subtrees with AGPL licenses
vow tree -d 2                    # Limit depth
vow tree --direction bottom-up   # Reverse direction
```

### `vow fix`

Find permissively-licensed alternatives for policy violations.

```bash
vow fix                    # Suggest alternatives for all violations
vow fix -l 5               # Show up to 5 alternatives per package
```

### `vow hook`

Manage a git pre-commit hook that runs `vow check` before each commit. If any dependency has a denied license, the commit is blocked.

```bash
# Install the pre-commit hook
vow hook install

# Install for a specific project
vow hook install -p ~/projects/my-app

# Remove the pre-commit hook
vow hook uninstall

# Check if the hook is currently installed
vow hook status
```

The hook is idempotent — running `install` when already installed is a no-op. It appends to existing pre-commit hooks (compatible with Husky and custom `core.hooksPath` setups) rather than replacing them. If no `.vow.json` or `.vow.yml` policy file exists, the hook will skip checks until one is created.

### `vow export`

Export a full license report to a file.

```bash
vow export                        # Export as JSON (default)
vow export -f csv -o licenses.csv # Export as CSV
vow export -f markdown            # Export as Markdown
```

## Policy File

Vow uses a `.vow.yml` file at your project root. Write your license policy in plain English:

```yaml
policy: |
  Allow MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, and Unlicense.
  Allow LGPL for all dependency types.
  Block GPL and AGPL licenses.
  Block packages with no license or unknown license.
  Warn on any license not explicitly mentioned above.
```

The policy text is sent to the Claude API for parsing into structured rules. Parsed results are cached locally (SHA-256 hash, 30-day TTL), so the API is only called when the policy text changes.

You can also add package-level overrides:

```yaml
policy: |
  Allow MIT and Apache-2.0.
  Block GPL licenses.

overrides:
  - package: "some-gpl-package@1.2.3"
    action: allow
    reason: "Reviewed by legal team on 2024-01-15"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required for `vow check` and `vow fix` (policy parsing via Claude API) |
| `VERBOSE` | Enable verbose error output |

## Programmatic API

Vow exports its core modules for use as a library:

```typescript
import {
  executeScan,
  parsePolicy,
  evaluatePolicy,
  NpmResolver,
  buildGraph,
  classifyLicenseText,
  getLicenseCategory,
  isPermissive,
  isCopyleft,
} from 'vow';
```

## Project Structure

```
vow-tool/
├── src/
│   ├── cli.ts                 # CLI entry point (Commander.js)
│   ├── index.ts               # Programmatic API exports
│   ├── types.ts               # Core type definitions
│   ├── commands/
│   │   ├── scan.ts            # vow scan
│   │   ├── check.ts           # vow check
│   │   ├── tree.ts            # vow tree
│   │   ├── fix.ts             # vow fix
│   │   ├── init.ts            # vow init
│   │   ├── export.ts          # vow export
│   │   └── hook.ts            # vow hook install/uninstall/status
│   ├── resolvers/
│   │   ├── base.ts            # Abstract resolver with 6-step license resolution
│   │   └── npm.ts             # npm resolver (package-lock.json v1/v2/v3)
│   ├── license/
│   │   ├── spdx.ts            # SPDX expression parser and matcher
│   │   ├── classifier.ts      # TF-IDF license text classifier
│   │   ├── database.ts        # SPDX license database integration
│   │   └── categories.ts      # License categorization (permissive, copyleft, etc.)
│   ├── policy/
│   │   ├── parser.ts          # Plain-English policy parsing via Claude API
│   │   ├── evaluator.ts       # First-match-wins rule evaluation engine
│   │   ├── cache.ts           # SHA-256 policy cache with 30-day TTL
│   │   └── types.ts           # Policy type definitions
│   ├── graph/
│   │   ├── builder.ts         # Dependency graph construction
│   │   ├── walker.ts          # Graph traversal and filtering
│   │   └── visualizer.ts      # ASCII tree output
│   └── reporters/
│       ├── terminal.ts        # Colored terminal output
│       ├── json.ts            # JSON reporter
│       ├── csv.ts             # CSV reporter
│       ├── markdown.ts        # Markdown reporter
│       └── sarif.ts           # SARIF reporter (GitHub Code Scanning)
├── tests/                     # Vitest test suite
├── data/                      # Bundled data files
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

## Tech Stack

- **Language:** TypeScript (ES2022, ESM)
- **CLI framework:** Commander.js
- **License parsing:** spdx-expression-parse, spdx-satisfies, spdx-license-ids, spdx-license-list
- **Policy parsing:** Anthropic Claude API (claude-sonnet-4-20250514)
- **Config format:** YAML
- **Output:** Chalk, cli-table3
- **Build:** tsup
- **Testing:** Vitest

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Watch tests
npm run test:watch

# Type check
npm run lint
```

## License

MIT
