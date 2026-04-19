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

- **Multi-ecosystem dependency scanning:**
  - **npm** -- Parses `package-lock.json` (v1/v2/v3), handles scoped packages, workspaces, bundled deps, and dev/prod/peer/optional classification
  - **cargo** -- Parses `Cargo.lock` (v1/v2/v3 TOML), resolves license via the crates.io registry API with the same disk cache + TTL as npm. Works without running `cargo fetch`.
  - **pip** -- Parses `poetry.lock`, resolves license via the PyPI JSON API. Handles messy `info.license` strings (empty, long license-text blobs) by falling back to `info.classifiers` and mapping "License :: OSI Approved :: MIT License" → `MIT`. Works without running `poetry install`.
- **Monorepo support** -- Detects npm/yarn `workspaces` (array or `{packages: []}` form) and pnpm `pnpm-workspace.yaml`. Each workspace's direct dependencies are merged into the root's direct-dep set so graph depth is correct, and per-workspace metadata (`name`, `path`, `directDependencies`) is surfaced in the scan result.
- **5-step license resolution chain:**
  1. Package metadata (`license` field in package.json)
  2. SPDX expression parsing (`(MIT OR Apache-2.0)`)
  3. LICENSE file detection (LICENSE, LICENCE, COPYING variants; dual-license files like `LICENSE-MIT` + `LICENSE-APACHE` are combined into `(MIT OR Apache-2.0)`)
  4. TF-IDF text classifier (local, no API -- covers ~19 common licenses at cosine similarity ≥ 0.7)
  5. npm registry API fallback (cached at `~/.cache/vow/registry/`, 7-day TTL; negative cache for 404s) -- lets you scan in CI **without** running `npm install`. Disable with `--no-registry`.

  Packages that fall through all five steps are reported with `category: 'unknown'`. An AI-based fallback (Claude) is on the roadmap — see [next.md](./next.md).
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
- **Confidence gating** -- Each resolution returns a 0..1 confidence score (1.0 for direct SPDX metadata, 0.9 for normalized aliases, TF-IDF cosine similarity for classified text, etc.). Set `min_confidence` in `.vow.json` to flag packages whose license was only weakly resolved:
  ```json
  { "allow": ["MIT", "Apache-2.0"], "min_confidence": 0.9, "min_confidence_action": "warn" }
  ```
  Low-confidence packages are reported BEFORE license-id checks, so a TF-IDF "this looks like MIT at 0.72" match still surfaces even when MIT is allowed.
- **UNKNOWN license resolution** -- Automatically resolves packages with unknown licenses by reading their `LICENSE` / `LICENCE` / `COPYING` files directly from `node_modules`
- **`vow attribution`** -- Generates a `THIRD_PARTY_LICENSES.md` file containing every dependency's name, version, license identifier, and full license text:
  ```bash
  vow attribution                     # all deps
  vow attribution --production        # production deps only
  vow attribution -o NOTICES.md       # custom output path
  ```

## GitHub Action

Vow ships with a composite GitHub Action at `whenlabs-org/vow@v1` that wraps every CLI command:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: '20' }

- uses: whenlabs-org/vow@v1
  with:
    command: check           # or scan, diff, sbom, audit
    offline: 'true'          # use committed policy.lock.json
    fail-on: block
    format: markdown
    output-file: vow-check.md
```

See [docs/workflows/](./docs/workflows/) for ready-to-use workflow files:

- [`check-on-pr.yml`](./docs/workflows/check-on-pr.yml) — gate PRs on `vow check`, comment the verdict.
- [`diff-on-pr.yml`](./docs/workflows/diff-on-pr.yml) — scan base vs. head, post a license-diff PR comment.
- [`sbom-on-release.yml`](./docs/workflows/sbom-on-release.yml) — attach CycloneDX + SPDX SBOMs to every release.

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
| `--no-registry` | Disable npm registry API fallback (step 5) | registry enabled |
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

### `vow audit`

Generate a self-contained HTML compliance report for legal review. Renders scan + policy verdict + license texts for blocked/warned/unknown packages. Print-friendly CSS (`@media print`) turns the browser's "Save as PDF" into a clean artifact.

```bash
vow audit                          # writes audit.html
vow audit -o compliance-2026Q2.html
vow audit --offline                # require policy.lock.json
vow audit --policy custom.yml
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <dir>` | Project directory | `.` |
| `-o, --output <file>` | Output HTML file | `audit.html` |
| `--production` | Skip devDependencies | `false` |
| `--no-registry` | Disable registry API fallback | registry enabled |
| `--offline` | Require `policy.lock.json` | `false` |
| `--policy <file>` | Policy file | auto-detect |

### Ignoring packages

Skip specified packages from **policy evaluation only** — they still appear in `vow scan` output and in generated SBOMs (SBOMs should be complete). Two ways to ignore:

```bash
# One-off via CLI (repeatable):
vow check --ignore '@internal/*' --ignore 'acme-*'
vow audit --ignore '@internal/*'

# Or commit a .vowignore at the project root:
$ cat .vowignore
# Internal-only packages never go to prod
@internal/*
# Legacy deps under review
old-lib-*
```

`*` and `?` globs are supported; lines starting with `#` are comments. Ignored packages are reported as allowed with an explanation like `Ignored by pattern /@internal\/.*$/i`.

### `vow policy compile`

Pre-parse `.vow.yml` via the Claude API and write `policy.lock.json` to the project root. Commit the lockfile so CI can run `vow check --offline` without an `ANTHROPIC_API_KEY`.

```bash
vow policy compile              # parses .vow.yml and writes policy.lock.json
vow policy status               # is the lockfile up-to-date with .vow.yml?
```

### `vow check --offline`

Refuse to call the Claude API; require a committed `policy.lock.json` whose `sourceHash` matches the current `.vow.yml`. Errors with an actionable message if the lockfile is missing or stale.

```bash
vow check --offline             # CI-safe, no API key required
```

### `vow diff`

Compare a baseline scan against the current project. Flags added deps, removed deps, version bumps, and — most importantly — license changes. Severity is based on category rank (permissive → strongly-copyleft is an error; adding an AGPL dep is an error; license upgrade is info).

```bash
vow scan -f json -o prev.json           # record a baseline before your PR
# ... make changes ...
vow diff --baseline prev.json           # what changed?
vow diff --baseline prev.json -f markdown   # for PR comments
vow diff --baseline prev.json --fail-on error   # CI gate (exit 1 on errors)
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <dir>` | Project directory | `.` |
| `--baseline <file>` | Path to a previous scan JSON (from `vow scan -f json`) | required |
| `-f, --format <fmt>` | `terminal`, `markdown`, `json` | `terminal` |
| `--fail-on <level>` | `error`, `warning`, or `never` | `error` |
| `--production` | Skip devDependencies | `false` |
| `--no-registry` | Disable registry API fallback | registry enabled |
| `-o, --output <file>` | Write diff to file | stdout |

### `vow sbom`

Generate a Software Bill of Materials in CycloneDX 1.5 JSON or SPDX 2.3 JSON.

```bash
vow sbom -o sbom.json                          # CycloneDX (default)
vow sbom --format spdx -o sbom.spdx.json       # SPDX 2.3
vow sbom --production -o sbom.json             # Skip devDependencies
```

Each component / package gets a PURL (`pkg:npm/...`, `pkg:cargo/...`, `pkg:pypi/...`), SPDX license ID or compound expression, and dependency-graph edges. Required for EO 14028 / EU CRA compliance.

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <dir>` | Project directory | `.` |
| `-f, --format <fmt>` | `cyclonedx` or `spdx` | `cyclonedx` |
| `--production` | Skip devDependencies | `false` |
| `--no-registry` | Disable registry API fallback | registry enabled |
| `-o, --output <file>` | Write SBOM to file | stdout |

### `vow export`

Export a full license report to a file.

```bash
vow export                        # Export as JSON (default)
vow export -f csv -o licenses.csv # Export as CSV
vow export -f markdown            # Export as Markdown
```

## Error codes

Every exit-non-zero code path prints a stable `VOW-EXXXX` identifier so CI logs, docs, and bug reports share a vocabulary.

| Code | Exit | Meaning |
|------|------|---------|
| `VOW-E1001` | 1 | Policy violations detected (normal CI gate) |
| `VOW-E1002` | 1 | `vow diff` found changes above `--fail-on` threshold |
| `VOW-E2001` | 2 | No policy file found (`.vow.json` / `.vow.yml`) |
| `VOW-E2002` | 2 | Policy file missing `policy` field |
| `VOW-E2003` | 2 | Could not read policy file |
| `VOW-E2004` | 2 | `ANTHROPIC_API_KEY` required for `.vow.yml` parsing |
| `VOW-E2005` | 2 | `--offline` requires a matching `policy.lock.json` |
| `VOW-E2101` | 2 | Could not read baseline scan JSON |
| `VOW-E2201` | 2 | Invalid `--format` argument |
| `VOW-E2301` | 2 | Could not write output file |

Exit `1` is reserved for expected domain failures that a CI gate opted into. Exit `2` is operational — usually a fixable misconfig.

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
│   │   ├── base.ts            # Abstract resolver with 4-step license resolution chain
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
