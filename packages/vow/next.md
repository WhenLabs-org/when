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
- **License resolution (5-step priority chain, shipping today):**
  1. Package metadata (`license` field in package.json)
  2. SPDX expression parsing (`(MIT OR Apache-2.0)`)
  3. LICENSE file detection (LICENSE, LICENCE, COPYING variants)
  4. TF-IDF text classifier (local, no API — ~19 common licenses, cosine similarity ≥ 0.7)
  5. npm registry API fallback with disk-cached responses (7-day TTL; negative cache for 404s)

  An AI-based fallback via Claude is on the roadmap (see "What's Next").
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
- ✅ **cargo resolver** (shipping) — Parses `Cargo.lock`, uses the crates.io registry API (`/api/v1/crates/{name}/{version}`) with disk-cached responses. Rust crates have excellent SPDX metadata, so this is effectively step-1 quality straight from the registry.
- ✅ **pip resolver (poetry.lock)** (shipping) — Parses `poetry.lock`, uses the PyPI JSON API (`/pypi/{name}/{version}/json`) with classifier → SPDX fallback for when `info.license` is empty or a long text blob. Next: `Pipfile.lock`, `uv.lock`, `pdm.lock`, and installed-METADATA fallback.
- All extend the existing `BaseResolver` abstract class — the license resolution chain is shared.

#### Offline Policy Mode
- ✅ **`vow policy compile` + `vow check --offline`** (shipping) — pre-parse `.vow.yml` into a hash-pinned `policy.lock.json`. `vow check` transparently prefers the lockfile over the user-level cache + API path, so CI runs without `ANTHROPIC_API_KEY` as long as the lockfile is committed and up-to-date with the policy text. `vow policy status` reports whether the lockfile is stale.

#### GitHub Action
- ✅ **`whenlabs-org/vow@v1`** (shipping) — composite action wrapping every CLI command (`check`, `scan`, `diff`, `sbom`, `audit`). JavaScript-based (no Docker), so it's fast and runs on Linux/macOS/Windows runners. Three ready-to-use workflow templates in `docs/workflows/`:
  * `check-on-pr.yml` — PR-comment verdict with `--offline` (no API key needed, uses committed `policy.lock.json`).
  * `diff-on-pr.yml` — scan base branch + head branch, surface license downgrades as PR comment.
  * `sbom-on-release.yml` — attach CycloneDX + SPDX SBOMs to GitHub Releases.
- Follow-up: pre-compiled JavaScript entrypoint to skip `npm install -g` on each run (would also let the action vendor vow so it works without network).

#### npm Publish
- Publish as `vow` on npm
- `npx vow scan` works out of the box
- Zero config for scanning, one YAML file for policy

#### License Change Detection
- ✅ **`vow diff --baseline prev.json`** (shipping) — detects added/removed/version-bumped/license-changed packages. Severity derives from the category-rank downgrade gap: MIT → LGPL is a warning, MIT → GPL is an error, MIT → AGPL is an error. New AGPL dep is an error. License upgrade (GPL → MIT) is info. Terminal, Markdown (PR comments), and JSON output formats. `--fail-on error|warning|never` for CI gating.
- Follow-ups: historical series (track a branch over time), auto-post to GitHub PRs (covered by the GitHub Action item below).

#### SBOM Generation
- ✅ **CycloneDX 1.5 JSON** + **SPDX 2.3 JSON** (shipping) — `vow sbom --format cyclonedx|spdx`. Produces PURLs (`pkg:npm/...`, `pkg:cargo/...`, `pkg:pypi/...`), SPDX license IDs or compound expressions, and dependency-graph edges. Deterministic timestamps + UUIDs via programmatic options for reproducible builds.
- Follow-ups: CycloneDX XML, vulnerability stub (so the SBOM can feed OSV / NVD consumers), SPDX tag-value format.

### Medium-Term

#### Registry API Fallback for non-npm ecosystems
- npm registry fallback shipped in v0.2 (disk-cached, opt-out via `--no-registry`)
- Query PyPI API for Python packages
- Query crates.io API for Rust crates
- Enables scanning in CI without running the relevant package manager's install step

#### AI Fallback (Step 6 of resolution chain)
- For truly ambiguous license text that the TF-IDF classifier can't handle
- Send license text to Claude for classification
- Behind paid tier / feature flag
- Confidence score returned, user prompted for review if low

#### Monorepo Support
- ✅ **Workspace discovery** (shipping) — npm / yarn v1 / yarn berry `workspaces` field (array or `{packages: []}` form) + pnpm `pnpm-workspace.yaml`. Expands simple `*` globs (no globstar). Each workspace's direct deps get merged into the root direct-dep set so graph depth accounts for workspace-owned deps.
- Per-workspace policy overrides via `workspaces:` key in `.vow.yml` — follow-up
- Aggregate report that groups findings by workspace — follow-up

#### `vow audit` Command
- ✅ **`vow audit`** (shipping) — self-contained HTML report with scan + policy verdict + license texts for blocked/warned/unknown packages. Print-friendly CSS produces clean PDFs via any browser's "Save as PDF". Per-package sections with category chips, confidence scores, dep paths, and matched policy rules. Suitable for legal team review and compliance audits.
- Follow-up: native PDF output via Puppeteer/Playwright for headless CI generation.

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

#### Operational Polish
- ✅ **Cross-run license cache** (shipping) — `~/.cache/vow/licenses/{ecosystem}/name@version.json` with 30-day TTL. Repeat scans skip readdir + readFile + TF-IDF for already-seen versions. Auto-disabled inside `VITEST` so test isolation is preserved.
- ✅ **Streaming concurrency** (shipping) — `pLimit(32)` across all three resolvers replaces the old batched `Promise.all(chunk)` pattern. A slow registry-api task no longer stalls the next batch.
- ✅ **`.vowignore` + `--ignore`** (shipping) — glob-based package exclusions that short-circuit policy eval (packages still appear in scan / SBOM). `@internal/*` and friends.
- ✅ **Structured error codes** (shipping) — every exit-non-zero prints a stable `VOW-EXXXX` identifier. Catalog of 10 codes split into domain (1xxx, exit 1) vs operational (2xxx, exit 2) classes.
- Follow-up: pre-compiled JS action entrypoint; worker-thread TF-IDF for very large trees (>5k deps).

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
