# Vow

Scan your project's entire dependency tree, resolve the license for every package, and validate them against an `allow` / `deny` / `warn` policy. Outputs a pass/fail report suitable for CI, PR comments, and legal review.

Part of the [WhenLabs](https://whenlabs.org) umbrella.

> **Part of the [WhenLabs toolkit](https://github.com/WhenLabs-org/when)** — install all 6 tools with one command:
> ```
> npx @whenlabs/when install
> ```

## Why vow?

| | vow | license-checker | Manually checking |
|---|---|---|---|
| Multi-ecosystem | npm (lockfile), Cargo.lock, poetry.lock | npm only | Different tool per ecosystem |
| Scans transitive deps | Full dependency tree via lockfile | Direct deps only by default | Impractical at scale |
| CI-ready | Exit codes, JSON/CSV/Markdown output, GitHub annotations | JSON/CSV output | Custom scripting |
| Attribution file | `vow attribution` writes `THIRD_PARTY_LICENSES.md` | Manual collation | Manual collation |
| SBOMs | CycloneDX 1.5 + SPDX 2.3 | No SBOM support | Separate tooling |
| Dependency graph | Cycle detection, depth calculation, path-to-root tracing | Flat list | No visibility |

## Features

- **Multi-ecosystem dependency scanning**
  - **npm** — Parses `package-lock.json` (v1/v2/v3), handles scoped packages, workspaces, bundled deps, and dev/prod/peer/optional classification.
  - **cargo** — Parses `Cargo.lock` (v1/v2/v3 TOML), resolves license via the crates.io registry API. Works without running `cargo fetch`.
  - **pip** — Parses `poetry.lock`, resolves license via the PyPI JSON API; falls back to `info.classifiers` when `info.license` is empty or a license-text blob. Works without running `poetry install`.
- **Monorepo support** — Detects npm/yarn `workspaces` (array or `{packages: []}` form) and pnpm `pnpm-workspace.yaml`. Each workspace's direct dependencies are merged into the root's direct-dep set so graph depth is correct.
- **5-step license resolution chain**
  1. Package metadata (`license` field in `package.json`)
  2. SPDX expression parsing (`(MIT OR Apache-2.0)`)
  3. LICENSE file detection (LICENSE, LICENCE, COPYING variants; dual-license files like `LICENSE-MIT` + `LICENSE-APACHE` are combined into `(MIT OR Apache-2.0)`)
  4. TF-IDF text classifier (local, no API — covers ~19 common licenses at cosine similarity ≥ 0.7)
  5. npm registry API fallback (cached at `~/.cache/vow/registry/`, 7-day TTL; negative cache for 404s) — scan in CI **without** running `npm install`. Disable with `--no-registry`.

  Packages that fall through all five steps are reported with `category: 'unknown'`.
- **Allow / deny / warn policy engine** — First-match-wins evaluator. Supports SPDX OR/AND legal semantics, scope filtering (dev/prod), and ignore globs.
- **Confidence gating** — Each resolution returns a 0..1 confidence score (1.0 for direct SPDX metadata, 0.9 for normalized aliases, TF-IDF cosine similarity for classified text). Set `min_confidence` in `.vow.yml` to flag packages whose license was only weakly resolved.
- **Dependency graph** — Directed graph with cycle detection, BFS depth calculation, path-to-root tracing.
- **4 report formats** — Terminal (colored tables), JSON, CSV, Markdown. `vow check` additionally emits `github` annotations for GitHub Actions.
- **SBOMs** — CycloneDX 1.5 JSON and SPDX 2.3 JSON output, with PURLs for npm/cargo/pypi.
- **UNKNOWN license resolution** — Automatically resolves packages with unknown licenses by reading their `LICENSE` / `LICENCE` / `COPYING` files directly from `node_modules`.
- **`vow attribution`** — Generates a `THIRD_PARTY_LICENSES.md` file containing every dependency's name, version, license identifier, and full license text.

## Installation

> **Recommended:** Install the full WhenLabs toolkit with `npx @whenlabs/when install` to get vow plus 5 other tools in one step.

```bash
npm install -g @whenlabs/vow
```

Or run directly:

```bash
npx @whenlabs/vow scan
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
| `--no-license-cache` | Disable cross-run license cache at `~/.cache/vow/licenses/` | cache enabled |
| `-f, --format <fmt>` | `terminal`, `json`, `csv`, `markdown` | `terminal` |
| `-o, --output <file>` | Write output to file | stdout |

### `vow check`

Validate licenses against an `allow` / `deny` / `warn` policy (`.vow.json` or `.vow.yml`). Auto-detects whichever exists (JSON takes precedence).

```bash
vow check                              # Check against .vow.json / .vow.yml
vow check --policy custom-policy.yml   # Use a custom policy file
vow check --ci                         # Exit code 1 on violations
vow check --fail-on warn               # Fail on warnings too
vow check -f github                    # GitHub Actions annotations
vow check --ignore '@internal/*'       # Skip packages from policy eval
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <dir>` | Project directory | `.` |
| `--policy <file>` | Policy file | auto-detect |
| `--ci` | CI mode (exit 1 on violations) | `false` |
| `--fail-on <level>` | `block` or `warn` | `block` |
| `--ignore <pattern>` | Glob to exclude packages from policy eval (repeatable) | — |
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

- **commercial** — Allows permissive licenses and LGPL, blocks GPL/AGPL.
- **opensource** — Allows permissive + LGPL/MPL, warns on GPL, blocks AGPL.
- **strict** — Allows only MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause; blocks everything else.

### `vow tree`

Display the dependency tree with license annotations.

```bash
vow tree                         # Full tree
vow tree --filter agpl           # Show only subtrees with AGPL licenses
vow tree -d 2                    # Limit depth
vow tree --direction bottom-up   # Reverse direction
```

### `vow attribution`

Generate a `THIRD_PARTY_LICENSES.md` file listing every dependency's name, version, license identifier, and full license text.

```bash
vow attribution                     # all deps
vow attribution --production        # production deps only
vow attribution -o NOTICES.md       # custom output path
```

### `vow export`

Export a full license report to a file.

```bash
vow export                        # JSON (default)
vow export -f csv -o licenses.csv # CSV
vow export -f markdown            # Markdown
```

### `vow sbom`

Generate a Software Bill of Materials in CycloneDX 1.5 JSON or SPDX 2.3 JSON.

```bash
vow sbom -o sbom.json                          # CycloneDX (default)
vow sbom --format spdx -o sbom.spdx.json       # SPDX 2.3
vow sbom --production -o sbom.json             # Skip devDependencies
```

Each component / package gets a PURL (`pkg:npm/...`, `pkg:cargo/...`, `pkg:pypi/...`), SPDX license ID or compound expression, and dependency-graph edges. Required for EO 14028 / EU CRA compliance.

## Policy File

Vow uses a `.vow.yml` (or `.vow.json`) file at your project root. Declare allowed, denied, and warned licenses as SPDX IDs:

```yaml
# .vow.yml
allow:
  - MIT
  - Apache-2.0
  - ISC
  - BSD-2-Clause
  - BSD-3-Clause
  - Unlicense
  - LGPL-2.1-only
  - LGPL-3.0-only
deny:
  - GPL-2.0-only
  - GPL-3.0-only
  - AGPL-3.0-only
warn:
  - LGPL-*
min_confidence: 0.6
min_confidence_action: warn
```

**Semantics:**

- `allow` / `deny` / `warn` lists match SPDX IDs (exact or glob with `*`).
- `deny` wins over `allow` when a license appears in both.
- `min_confidence` flags any resolved license whose confidence is below the threshold (0..1). `min_confidence_action` is `warn` (default) or `block`.
- Compound expressions like `(MIT OR Apache-2.0)` pass if *any* alternative is allowed (SPDX `OR` semantics); dual licenses joined with `AND` must all be allowed.

### Ignoring packages

Skip specified packages from **policy evaluation only** — they still appear in `vow scan` output and in generated SBOMs. Two ways to ignore:

```bash
# One-off via CLI (repeatable):
vow check --ignore '@internal/*' --ignore 'acme-*'

# Or commit a .vowignore at the project root:
$ cat .vowignore
# Internal-only packages never go to prod
@internal/*
# Legacy deps under review
old-lib-*
```

`*` and `?` globs are supported; lines starting with `#` are comments.

## CI Integration

```yaml
name: License Check
on: [pull_request]
jobs:
  vow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @whenlabs/vow check --ci -f github
```

## Error codes

Every exit-non-zero code path prints a stable `VOW-EXXXX` identifier so CI logs, docs, and bug reports share a vocabulary.

| Code | Exit | Meaning |
|------|------|---------|
| `VOW-E1001` | 1 | Policy violations detected (normal CI gate) |
| `VOW-E2001` | 2 | No policy file found (`.vow.json` / `.vow.yml`) |
| `VOW-E2003` | 2 | Could not read policy file |
| `VOW-E2201` | 2 | Invalid `--format` argument |

Exit `1` is reserved for expected domain failures that a CI gate opted into. Exit `2` is operational — usually a fixable misconfig.

## Programmatic API

Vow exports its core modules for use as a library:

```typescript
import {
  executeScan,
  evaluatePolicy,
  loadJsonPolicy,
  loadYamlPolicy,
  NpmResolver,
  buildGraph,
  classifyLicenseText,
  getLicenseCategory,
  isPermissive,
  isCopyleft,
} from '@whenlabs/vow';
```

## Tech Stack

- **Language:** TypeScript (ES2022, ESM)
- **CLI framework:** Commander.js
- **License parsing:** spdx-expression-parse, spdx-satisfies, spdx-license-ids, spdx-license-list
- **Config format:** YAML / JSON
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
