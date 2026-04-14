# LicenseGuard — Dependency License Auditor with Plain-English Policies

## What We're Building

LicenseGuard is a CLI tool that scans your project's entire dependency tree (including transitive dependencies), resolves the license for every package, and validates them against a policy you define in plain English. It outputs a pass/fail report suitable for CI, PR comments, and legal review.

---

## The Core Problem

Every software company ships code that includes hundreds (sometimes thousands) of open source dependencies. Each one has a license. Some licenses are permissive (MIT, Apache-2.0, BSD) and safe for commercial use. Others are copyleft (GPL, AGPL) and can legally require you to open-source your own code.

The pain points:

- **Legal asks, developer scrambles.** Legal team says "confirm we have no AGPL dependencies." Developer runs `license-checker`, gets a wall of 800 packages, and spends a day manually reviewing.
- **Transitive surprises.** You use `package-a` (MIT) which depends on `package-b` (MIT) which depends on `package-c` (GPL-3.0). You never chose `package-c`, but you're bound by its license.
- **Unknown/custom licenses.** Many packages have `UNLICENSED`, `SEE LICENSE IN LICENSE.md`, or custom license text that doesn't map to any SPDX identifier. These are the dangerous ones.
- **License changes between versions.** A package was MIT in v2.x and switched to BSL/SSPL in v3.x. Your lockfile upgrade just changed your legal obligations.
- **Multi-ecosystem projects.** A fullstack app has npm, pip, and cargo dependencies. No single tool covers all three.
- **Enterprise tools are expensive.** FOSSA starts at $10K+/year. Snyk license compliance is part of their enterprise tier. For a small team or solo dev, there's nothing affordable.

---

## How It Works

### 1. Scan

```bash
$ licenseguard scan

Scanning dependencies...
  npm: package-lock.json (1,247 packages)
  pip: requirements.txt (89 packages)

Resolving licenses...
  ████████████████████████████████ 1,336/1,336

── License Summary ──────────────────────────────────────
  MIT            892  (66.8%)
  Apache-2.0     201  (15.0%)
  ISC            98   (7.3%)
  BSD-3-Clause   67   (5.0%)
  BSD-2-Clause   34   (2.5%)
  GPL-3.0        12   (0.9%)
  LGPL-2.1       8    (0.6%)
  AGPL-3.0       2    (0.15%)
  Unknown        15   (1.1%)
  Custom         7    (0.5%)

── Attention Required ──────────────────────────────────
  ✗ 2 packages with AGPL-3.0
  ⚠ 15 packages with unknown license
  ⚠ 7 packages with custom/non-SPDX license
```

### 2. Policy Definition

This is the killer feature. Instead of writing regex rules or JSON config, you describe your policy in English:

```yaml
# .licenseguard.yml
policy: |
  Allow MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, and Unlicense.
  Allow LGPL only for runtime dependencies that are dynamically linked.
  Block all GPL and AGPL licenses.
  Block any package with no license or an unknown license.
  Warn on any license not explicitly mentioned above.
  Allow copyleft licenses in devDependencies only.
```

When you run `licenseguard check`, the tool:
1. Parses this policy using Claude API into structured rules
2. Caches the parsed rules (so Claude is only called when policy text changes)
3. Evaluates every dependency against the rules
4. Outputs pass/fail with explanations

```bash
$ licenseguard check

Policy: .licenseguard.yml (parsed, 6 rules)

── Policy Violations ──────────────────────────────────────

BLOCKED:
  ✗ mongo-express-serialize@2.1.0 (AGPL-3.0)
    └── Required by: admin-panel@1.0.0 → mongo-admin@3.2.1
    Rule: "Block all GPL and AGPL licenses"
    Impact: Transitive dependency (depth: 2)
    Action: Find alternative or remove admin-panel

  ✗ ghostscript4js@3.0.1 (AGPL-3.0)
    └── Required by: pdf-generator@2.0.0
    Rule: "Block all GPL and AGPL licenses"
    Impact: Direct dependency
    Action: Replace with pdf-lib (MIT) or pdfkit (MIT)

WARNINGS:
  ⚠ custom-logger@1.0.0 (Custom License)
    License text: "Free for non-commercial use..."
    Rule: "Warn on any license not explicitly mentioned"
    Action: Review license text manually

  ⚠ legacy-utils@0.5.0 (UNKNOWN)
    No LICENSE file, no license field in package.json
    Rule: "Block any package with no license"
    Action: Contact maintainer or find alternative

── Result ──────────────────────────────────────────────
  2 blocked (build will fail in CI)
  2 warnings (manual review needed)
  1,332 passed
```

### 3. Dependency Tree Visualization

```bash
$ licenseguard tree --filter agpl

mongo-express-serialize@2.1.0 (AGPL-3.0) ← BLOCKED
└── mongo-admin@3.2.1 (MIT)
    └── admin-panel@1.0.0 (MIT)
        └── YOUR PROJECT

ghostscript4js@3.0.1 (AGPL-3.0) ← BLOCKED
└── pdf-generator@2.0.0 (MIT)
    └── YOUR PROJECT
```

### 4. Fix Suggestions

```bash
$ licenseguard fix

For mongo-express-serialize@2.1.0 (AGPL-3.0):
  Alternative packages (MIT/Apache):
  → mongo-sanitize (MIT) — 2.1M weekly downloads
  → express-mongo-sanitize (MIT) — 890K weekly downloads

For ghostscript4js@3.0.1 (AGPL-3.0):
  Alternative packages (MIT/Apache):
  → pdf-lib (MIT) — 1.8M weekly downloads
  → pdfkit (MIT) — 950K weekly downloads
  → @react-pdf/renderer (MIT) — 420K weekly downloads
```

### 5. CI Integration

```bash
# Exit code 0 = all pass, 1 = violations found
licenseguard check --ci

# Specific environment
licenseguard check --ci --production-only  # Skip devDependencies

# Output for different CI systems
licenseguard check --format github   # GitHub Actions annotation format
licenseguard check --format gitlab   # GitLab CI report format
licenseguard check --format json     # Generic JSON
```

### 6. GitHub Action

```yaml
name: License Compliance
on: [pull_request]
jobs:
  license-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: licenseguard/action@v1
        with:
          policy: .licenseguard.yml
          fail-on: block
          comment: true
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}  # Only needed first run or policy change
```

---

## Technical Architecture

### License Resolution Strategy

The tool resolves licenses in priority order:

1. **Package metadata** — `license` field in package.json / setup.py / Cargo.toml
2. **SPDX expression parsing** — Handle complex expressions like `(MIT OR Apache-2.0)`
3. **LICENSE file detection** — Read the actual LICENSE/COPYING file in the package
4. **License text classification** — Use a local classifier (not AI) to identify license from text content
5. **Registry API fallback** — Check npm registry, PyPI, crates.io API for license metadata
6. **AI fallback (paid)** — For truly ambiguous cases, send license text to Claude for classification

### Stack

```
Language:       TypeScript
CLI framework:  Commander.js
License DB:     SPDX license list (bundled, ~500 licenses)
License parser: spdx-expression-parse, spdx-satisfies
Text matching:  Local TF-IDF classifier for LICENSE file identification (no AI needed)
Policy parsing: Claude API (called once, result cached)
Dep resolution: npm (read package-lock.json), pip (pipdeptree), cargo (cargo-metadata)
Tree building:  Custom dependency graph with cycle detection
Output:         Chalk for terminal, Handlebars for markdown
Package:        npm CLI + GitHub Action
Testing:        Vitest with fixture packages covering edge cases
```

### Project Structure

```
licenseguard/
├── src/
│   ├── cli.ts
│   ├── commands/
│   │   ├── scan.ts           # Scan and summarize all licenses
│   │   ├── check.ts          # Validate against policy
│   │   ├── tree.ts           # Dependency tree with license annotations
│   │   ├── fix.ts            # Suggest alternatives for violations
│   │   ├── init.ts           # Generate starter policy
│   │   └── export.ts         # Export full license report (CSV, PDF, JSON)
│   ├── resolvers/
│   │   ├── npm.ts            # Resolve licenses from node_modules / lockfile
│   │   ├── pip.ts            # Resolve licenses from Python packages
│   │   ├── cargo.ts          # Resolve licenses from Rust crates
│   │   └── base.ts           # Shared resolution logic
│   ├── license/
│   │   ├── spdx.ts           # SPDX expression parser and matcher
│   │   ├── classifier.ts     # Local text-based license classifier
│   │   ├── database.ts       # Bundled SPDX license database
│   │   └── categories.ts     # License categories (permissive, copyleft, etc.)
│   ├── policy/
│   │   ├── parser.ts         # Parse plain-English policy via Claude
│   │   ├── evaluator.ts      # Evaluate packages against parsed rules
│   │   ├── cache.ts          # Cache parsed policy (avoid repeated API calls)
│   │   └── types.ts          # Policy rule type definitions
│   ├── reporters/
│   │   ├── terminal.ts
│   │   ├── json.ts
│   │   ├── markdown.ts
│   │   ├── csv.ts            # For legal team export
│   │   └── sarif.ts
│   └── graph/
│       ├── builder.ts        # Build dependency graph
│       ├── walker.ts         # Walk graph for transitive license propagation
│       └── visualizer.ts     # ASCII tree output
├── data/
│   └── spdx-licenses.json   # Bundled SPDX license database
├── action/
│   ├── action.yml
│   └── Dockerfile
├── tests/
│   ├── fixtures/             # Fake packages with various licenses
│   └── resolvers/
├── package.json
└── README.md
```

---

## Build Plan (Solo, Claude Code)

### Week 1: Core Scanning

- Day 1: Project setup, SPDX license database integration, type definitions
- Day 2: npm resolver — parse package-lock.json, read license fields, build dep graph
- Day 3: LICENSE file classifier — local TF-IDF matching against known license texts
- Day 4: Dependency tree builder with transitive license tracking
- Day 5: `scan` command — summary statistics, tree visualization
- Day 6: Terminal reporter with colored output, grouping by license
- Day 7: JSON/CSV export, basic test suite

### Week 2: Policy Engine + CI

- Day 1-2: Claude API integration for plain-English policy parsing
- Day 2: Policy cache (hash policy text, reuse parsed rules)
- Day 3: Policy evaluator — match rules against scanned licenses
- Day 4: `check` command with pass/fail output, CI exit codes
- Day 5: `fix` command — query npm registry for alternatives with permissive licenses
- Day 6: GitHub Action (Dockerfile, action.yml, PR comments)
- Day 7: npm publish, documentation, landing page

### Week 3: Multi-Ecosystem + Paid Tier

- Day 1-2: pip resolver (requirements.txt, pyproject.toml)
- Day 3: cargo resolver (Cargo.lock)
- Day 4: Web dashboard — project overview, compliance status, historical tracking
- Day 5: License change detection — compare current scan with previous, alert on changes
- Day 6: SBOM (Software Bill of Materials) generation in CycloneDX/SPDX format
- Day 7: Billing, API keys, Stripe integration

---

## Monetization

| Tier | Price | Features |
|------|-------|----------|
| Free (CLI) | $0 | Scan + check (npm only), terminal output, CI mode |
| Pro | $19/mo | Plain-English policies (Claude), all ecosystems, SBOM export, fix suggestions |
| Team | $49/mo (5 users) | Dashboard, historical tracking, license change alerts, CSV/PDF export for legal |
| Enterprise | Custom | SSO, audit log, custom policy templates, SLA |

---

## Competitive Landscape

| Tool | Price | Gap |
|------|-------|-----|
| license-checker (npm) | Free | Just lists licenses, no policy, no transitive analysis |
| FOSSA | $10K+/yr | Enterprise only, complex setup |
| Snyk License | Enterprise tier | Bundled with security, can't buy standalone |
| GitHub Dependency Graph | Free | Shows licenses but no policy enforcement |
| WhiteSource (Mend) | $5K+/yr | Enterprise, heavy integration |
| ScanCode | Free (OSS) | Powerful but complex CLI, no policy engine, no CI integration |

LicenseGuard's wedge: affordable, instant setup (`npx licenseguard scan`), and the plain-English policy engine means a developer can translate legal requirements into enforceable rules in 30 seconds.

---

## Key Differentiator: The Plain-English Policy

Every other tool requires you to learn a custom config format:

```json
// FOSSA style
{
  "rules": [
    {"type": "deny", "license": "AGPL-3.0-only"},
    {"type": "deny", "license": "GPL-3.0-only"},
    {"type": "allow", "license": "MIT"},
    {"type": "flag", "license": "UNKNOWN", "action": "review"}
  ]
}
```

LicenseGuard lets you write:

```
Allow MIT, Apache-2.0, ISC, and BSD licenses.
Block GPL and AGPL.
Flag unknown licenses for review.
Allow copyleft in test dependencies only.
```

The policy reads like an email from your legal team — because that's exactly what it usually is. Copy-paste the email, run the check.
