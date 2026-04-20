---
"@whenlabs/when": minor
---

Trim the MCP surface and wrapper CLI back to what the tagline promised.

- **MCP tools: 48 → 7.** One endpoint per tool plus velocity's timing pair: `aware_sync`, `berth_check`, `envalid_validate`, `stale_scan`, `vow_scan`, `velocity_start_task`, `velocity_end_task`. Agents drive scanning; fix/init/auxiliary operations move to each tool's CLI (`npx @whenlabs/<tool> --help`).
- **`when` CLI: 13 → 4.** Kept: `init`, `doctor`, `install`, `uninstall`. Removed: `status`, `ci`, `watch`, `config`, `upgrade`, `eject`, `diff`, `dashboard`, `mcp`, plus the `delegate` shims and the `.whenlabs.yml` unified-config plumbing. Each tool reads its own config again.
- **Install targets: Claude Code only.** Removed `--cursor`/`--vscode`/`--windsurf`/`--all` flags and the status-line Python script — `install` now writes exactly two files (`~/.claude.json` and `~/.claude/CLAUDE.md`).
- **Cross-tool SUGGESTION_RULES removed.** Agents decide when to chain tools.
- **GitHub Action (`packages/when/action.yml`) removed** — the Action depended on `when ci`. CI users can invoke each tool's CLI directly in their workflows.

Nothing on npm has shipped yet, so there is no consumer breakage. The underlying per-tool packages are unchanged; only the `@whenlabs/when` umbrella surface is reduced.
