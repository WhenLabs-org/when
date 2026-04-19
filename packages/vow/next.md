# Vow — Current State & What's Next

## What Vow Is

Vow is a CLI tool that scans your project's entire dependency tree (including transitive dependencies), resolves the license for every package, and validates them against a policy you define in plain English. It outputs a pass/fail report suitable for CI, PR comments, and legal review.

Part of the [WhenLabs](https://whenlabs.org) umbrella.

---

## What's Built (v0.1.0)

### Commands
- `vow scan` — Scan dependencies, resolve licenses, output summary
- `vow check` — Validate against plain-English policy (`.vow.yml`)
- `vow tree` — Dependency tree with license annotations and filtering
- `vow fix` — Suggest alternative packages for violations
- `vow init` — Generate starter policy file (commercial/opensource/strict templates)
- `vow export` — Export full report (JSON, CSV, Markdown)

### Core Features
- **npm resolver** — Parses `package-lock.json` v1/v2/v3, handles scoped packages, workspaces, bundled deps, dev/prod/peer/optional classification
- **License resolution (6-step priority chain):**
  1. Package metadata (`license` field in package.json)
  2. SPDX expression parsing (`(MIT OR Apache-2.0)`)
  3. LICENSE file detection (LICENSE, LICENCE, COPYING variants)
  4. TF-IDF text classifier (local, no API — covers ~20 common licenses)
  5. Registry API fallback (future)
  6. AI fallback via Claude (future/paid)
- **Dependency graph** — Directed graph with cycle detection, BFS depth calculation, path-to-root tracing
- **Plain-English policy engine** — Claude API parses natural language into structured rules, results cached (SHA-256 hash, 30-day TTL)
- **Policy evaluator** — First-match-wins rule engine with correct SPDX OR/AND legal semantics, scope filtering (dev/prod), overrides
- **5 output formats** — Terminal (colored tables), JSON, CSV, Markdown (PR comments), SARIF (GitHub Code Scanning)

### Test Coverage
- 74 tests across license resolution, SPDX parsing, npm resolver, graph builder, policy evaluator

---

## What's Next

### Near-Term (Week 3 scope)

#### Multi-Ecosystem Resolvers
- **pip resolver** — Parse `requirements.txt`, `Pipfile.lock`, `pyproject.toml` + `poetry.lock`. Read license metadata from installed packages (`pip show`) or PyPI API.
- **cargo resolver** — Parse `Cargo.lock`, use `cargo metadata` for license info. Rust crates typically have good SPDX metadata.
- Both extend the existing `BaseResolver` abstract class — the 6-step license resolution chain is shared.

#### GitHub Action
- `action.yml` + Dockerfile for `vow/action@v1`
- Auto-comments on PRs with violation summary
- Supports `fail-on: block` or `fail-on: warn`
- Requires `ANTHROPIC_API_KEY` secret (only on policy change)

#### npm Publish
- Publish as `vow` on npm
- `npx vow scan` works out of the box
- Zero config for scanning, one YAML file for policy

#### License Change Detection
- Compare current scan with previous (stored as JSON artifact)
- Alert on: new copyleft deps, license downgrades (MIT → GPL between versions), removed licenses
- Output as diff: `vow diff --baseline previous-scan.json`

#### SBOM Generation
- CycloneDX format (JSON + XML)
- SPDX SBOM format
- `vow sbom --format cyclonedx --output sbom.json`
- Required for supply chain compliance (Executive Order 14028, EU CRA)

### Medium-Term

#### Registry API Fallback (Step 5 of resolution chain)
- Query npm registry API for license metadata when `node_modules` not available
- Query PyPI API for Python packages
- Query crates.io API for Rust crates
- Enables scanning in CI without `npm install`

#### AI Fallback (Step 6 of resolution chain)
- For truly ambiguous license text that the TF-IDF classifier can't handle
- Send license text to Claude for classification
- Behind paid tier / feature flag
- Confidence score returned, user prompted for review if low

#### Monorepo Support
- Detect and scan multiple workspaces (npm workspaces, Yarn workspaces, pnpm workspaces)
- Per-workspace policy overrides
- Aggregate report across all workspaces

#### `vow audit` Command
- Generate a legal-ready PDF report
- Package name, version, license, license text, compliance status
- Suitable for legal team review and compliance audits

### Long-Term

#### Web Dashboard (on whenlabs.org)
- Project overview with compliance status
- Historical tracking — license compliance over time
- Team management — shared policies across projects
- License change alerts (email/Slack notifications)
- Integration with GitHub/GitLab for automatic PR scanning

#### Billing & Tiers
| Tier | Price | Features |
|------|-------|----------|
| Free (CLI) | $0 | Scan + check (npm only), terminal output, CI mode |
| Pro | $19/mo | Plain-English policies (Claude), all ecosystems, SBOM export, fix suggestions |
| Team | $49/mo (5 users) | Dashboard, historical tracking, license change alerts, CSV/PDF export |
| Enterprise | Custom | SSO, audit log, custom policy templates, SLA |

#### Additional Ecosystems
- Go modules (`go.sum`)
- Maven/Gradle (Java)
- NuGet (.NET)
- Composer (PHP)
- Bundler (Ruby)

---

## Competitive Position

| Tool | Price | Gap Vow Fills |
|------|-------|---------------|
| license-checker (npm) | Free | Just lists licenses — no policy, no transitive analysis |
| FOSSA | $10K+/yr | Enterprise only, complex setup |
| Snyk License | Enterprise tier | Bundled with security, can't buy standalone |
| GitHub Dependency Graph | Free | Shows licenses but no policy enforcement |
| WhiteSource (Mend) | $5K+/yr | Enterprise, heavy integration |
| ScanCode | Free (OSS) | Powerful but complex CLI, no policy engine, no CI integration |

**Vow's wedge:** Affordable, instant setup (`npx vow scan`), and the plain-English policy engine means a developer can translate legal requirements into enforceable rules in 30 seconds. Copy-paste the email from legal, run the check.
