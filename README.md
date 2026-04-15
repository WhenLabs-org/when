# @whenlabs/when

**Six tools. One install.**

A single installable toolkit that brings six WhenLabs developer tools into your Claude Code / AI coding agent workflow. Once installed, all tools are available as MCP tools in every session — Claude uses them automatically when relevant.

## Install

```bash
npx @whenlabs/when install
```

This is a one-time setup. After install, all six tools are available in every project you open with Claude Code.

## What it does

Running `npx @whenlabs/when install` will:

1. Register **two MCP servers** in your Claude Code configuration:
   - `velocity-mcp` — task timing and estimation tools
   - `whenlabs` — stale, envalid, berth, aware, and vow tools
2. Inject **CLAUDE.md instructions** so Claude knows when to use each tool automatically — and prefers them over shell commands

Once connected, Claude can call any tool directly without you asking. For example, after a refactor Claude might run `stale_scan` to check for doc drift, or before a release it might run `vow_check` to validate licenses.

## Proactive Background Scans

Tools run automatically in the background on a schedule and report findings in the Claude Code status line:

| Tool | Interval | Status line |
|------|----------|-------------|
| berth | 15 min | `ports:N` — port conflicts found |
| stale | 30 min | `stale:N` — docs drifted from code |
| envalid | 30 min | `env:N` — .env validation issues |
| vow | 60 min | `lic:N?` — unknown licenses found |
| aware | 60 min | `aware:stale` — AI context files outdated |

Only problems are shown — if everything is clean, the status line stays uncluttered. When Claude sees an issue in the status line, it proactively tells you and offers to fix it.

## MCP Tools

These tools are available to Claude in every session after install:

| MCP Tool | What it does |
|---|---|
| `velocity_start_task` | Start timing a coding task |
| `velocity_end_task` | End timing and record results |
| `velocity_estimate` | Estimate time for a planned task |
| `velocity_stats` | Show aggregate performance stats |
| `velocity_history` | Show task history |
| `stale_scan` | Detect documentation drift |
| `envalid_validate` | Validate .env files against schemas |
| `envalid_detect` | Find undocumented env vars in codebase |
| `berth_status` | Show active ports and conflicts |
| `berth_check` | Scan project for port conflicts |
| `aware_init` | Auto-detect stack, generate AI context files |
| `aware_doctor` | Diagnose project health and config issues |
| `vow_scan` | Scan and summarize dependency licenses |
| `vow_check` | Validate licenses against policy |

## Multi-Editor Support

Install MCP servers into other editors alongside Claude Code:

```bash
npx @whenlabs/when install --cursor     # Cursor
npx @whenlabs/when install --vscode     # VS Code
npx @whenlabs/when install --windsurf   # Windsurf
npx @whenlabs/when install --all        # All supported editors
```

Without flags, `install` targets Claude Code only.

## CLI Usage

You can also run tools directly from the command line:

```bash
when stale scan
when envalid validate
when berth status
when aware init
when vow scan
when status          # Show installation status
when doctor          # Run all tools, show unified health report
when ci              # Run checks for CI (exits 1 on issues)
```

### `when doctor`

Runs all 5 CLI tools against the current project and displays a unified health report card. Supports `--json` for machine-readable output.

### `when ci`

Runs stale, envalid, and vow checks — exits 1 if any tool finds issues. Designed for CI pipelines:

```bash
when ci --ci         # GitHub Actions annotations (::error file=X::message)
when ci --json       # Machine-readable JSON output
```

### GitHub Action

```yaml
- uses: WhenLabs-org/when@main
  with:
    checks: stale,envalid,vow
```

## Uninstall

```bash
npx @whenlabs/when uninstall
```

Removes both MCP servers and cleans up CLAUDE.md instructions.

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [Siddharth](https://github.com/Caissaisdead) at [WhenLabs](https://github.com/WhenLabs-org)
