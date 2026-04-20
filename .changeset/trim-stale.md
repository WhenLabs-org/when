---
"@whenlabs/stale": major
"@whenlabs/when": patch
---

Trim stale: drop AI analyzers, fix, watch, sarif.

Per the audit, stale's AI-powered analyzers (`--deep` / semantic /
completeness / examples) had real Claude API calls wired up but zero
test coverage. The `fix` command (580 LOC of auto-rewrite logic) and
`watch` command (chokidar-based re-scan) both overlap with standard
linter/IDE workflows.

Removed:
  - `src/analyzers/ai/` (semantic, completeness, examples + client)
  - `src/commands/fix.ts`, `src/commands/watch.ts`
  - `src/reporters/sarif.ts`
  - `--deep` and sarif format flags from CLI + Tool API
  - `DriftCategory`: dropped `semantic`, `completeness`, `example`,
    `architecture`, `response-shape` (all AI-only)
  - `AiAnalyzer` type, `getAiAnalyzers()`
  - `config.ai.*` fields + merging
  - Dependencies: `@anthropic-ai/sdk`, `chokidar`, `handlebars`
  - Corresponding tests + snapshots + GitHub Action `deep` input

The wrapper's `stale_scan` MCP tool no longer advertises `deep` or
`sarif` format (`@whenlabs/when` patch bump).

Kept: `scan`, `init`, 10 static analyzers, terminal/json/markdown
reporters, `--git` flag, the GitHub Action.

Major version bump for stale.
