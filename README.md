# @whenlabs/when

**Six tools. One install.**

A single installable toolkit that brings six WhenLabs developer tools into your Claude Code / AI coding agent workflow. Once installed, all tools are available as MCP tools in every session — Claude uses them automatically when relevant.

Five tools (stale, envalid, berth, aware, vow) have CLI scan modes and run on a schedule. Velocity is the sixth tool — it is always-on and embedded (SQLite-backed), so it does not have a CLI scan mode and does not appear in `doctor`/`watch`/`init`/`ci` output.

## Install

```bash
npx @whenlabs/when install
```

This is a one-time setup. After install, all six tools are available in every project you open with Claude Code.

## What it does

Running `npx @whenlabs/when install` will:

1. Register a **single MCP server** (`whenlabs`) in your Claude Code configuration — all six tools, including velocity, are served from one server
2. Inject **CLAUDE.md instructions** so Claude knows when to use each tool automatically — and prefers them over shell commands
3. Clean up any legacy `velocity-mcp` registrations (velocity is now bundled)

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
| `velocity_stats` | Show aggregate performance stats with insights |
| `velocity_history` | Show task history |
| `stale_scan` | Detect documentation drift |
| `stale_fix` | Auto-fix documentation drift (wrong paths, dead links, phantom env vars) |
| `stale_auto_fix` | Scan + auto-fix drift in one call |
| `envalid_validate` | Validate .env files against schemas |
| `envalid_detect` | Find undocumented env vars in codebase |
| `envalid_generate_schema` | Generate .env.schema from code analysis |
| `envalid_auto_fix` | Detect undocumented vars + auto-generate schema entries |
| `berth_status` | Show active ports and conflicts |
| `berth_check` | Scan project for port conflicts |
| `berth_resolve` | Auto-resolve port conflicts (kill or reassign) |
| `berth_auto_resolve` | Check + auto-resolve conflicts in one call |
| `aware_init` | Auto-detect stack, generate AI context files |
| `aware_doctor` | Diagnose project health and config issues |
| `aware_auto_sync` | Diagnose + auto-sync stale AI context files |
| `vow_scan` | Scan and summarize dependency licenses |
| `vow_check` | Validate licenses against policy |
| `vow_hook_install` | Install pre-commit license check hook |

> This table shows a highlights subset. Run `when <tool> --help` for all available commands per tool.

### Cross-tool Intelligence

Tools automatically suggest follow-up actions when they detect issues relevant to other tools. For example, `aware_init` triggers a `stale_scan` when it generates new files, and `envalid_detect` suggests `berth_register` when it finds service URL env vars. These cascading suggestions surface as "Tip:" lines in tool output.

## Multi-Editor Support

Install MCP servers into other editors alongside Claude Code:

```bash
npx @whenlabs/when install --cursor     # Cursor
npx @whenlabs/when install --vscode     # VS Code
npx @whenlabs/when install --windsurf   # Windsurf
npx @whenlabs/when install --all        # All supported editors
```

Without flags, `install` targets Claude Code only.

### Manual MCP configuration

If you're using an MCP client not covered by the installer — or you prefer to manage configs by hand — add the following entry to your client's MCP server list:

```json
{
  "mcpServers": {
    "whenlabs": {
      "command": "npx",
      "args": ["-y", "@whenlabs/when", "mcp"]
    }
  }
}
```

- **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- **Cursor** — Settings → Features → Model Context Protocol → add server
- **Any MCP-compatible client** — point it at `npx -y @whenlabs/when mcp`

The server speaks stdio and requires Node 20+. All 48 tools listed below are served from this single entry point.

## CLI Usage

You can also run tools directly from the command line:

```bash
when init            # Onboard a project — bootstrap configs, run all tools, auto-fix
when config          # Show unified .whenlabs.yml config
when config init     # Generate .whenlabs.yml from existing tool configs
when config validate # Validate config structure
when stale scan
when stale fix       # Auto-fix documentation drift
when envalid validate
when envalid detect --generate  # Generate schema from code
when berth status
when berth resolve   # Auto-resolve port conflicts
when aware init
when vow scan
when vow hook install  # Install pre-commit license hook
when status          # Show installation status
when doctor          # Run all tools, show unified health report
when doctor --watch  # Continuous monitoring dashboard
when watch           # Background daemon for status line
when ci              # Run checks for CI (exits 1 on issues)
```

### `when init`

One command to fully onboard any project:
1. **Bootstrap** — creates `.env.schema`, `.vow.json`, `.stale.yml`, and registers berth ports based on your project
2. **Scan** — runs all 5 CLI tools in parallel
3. **Auto-fix** — automatically fixes stale drift if detected
4. **Config** — generates a unified `.whenlabs.yml` from the bootstrapped configs

### `when config`

Manage the unified `.whenlabs.yml` project config. All six tools read their settings from this single file instead of separate config files. Subcommands: `init` (generate from existing configs), `validate` (check structure).

### `when doctor`

Runs all 5 CLI tools against the current project and displays a unified health report card. Supports `--json` for machine-readable output and `--watch` for continuous monitoring with a live dashboard.

### `when watch`

Background daemon that runs all 5 CLI tools on intervals and writes results to `~/.whenlabs/status.json`. Powers the Claude Code status line integration. Use `--once` for a single scan or `--interval <seconds>` to customize the schedule.

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

Removes the MCP server and cleans up CLAUDE.md instructions.

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [Siddharth](https://github.com/Caissaisdead) at [WhenLabs](https://github.com/WhenLabs-org)
