import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registerMcpServer } from '../utils/mcp-config.js';
import { injectBlock } from '../utils/claude-md.js';
import { installForEditor, ALL_EDITORS, type EditorName } from '../utils/editor-config.js';

const CLAUDE_MD_PATH = join(homedir(), '.claude', 'CLAUDE.md');
const SCRIPTS_DIR = join(homedir(), '.claude', 'scripts');
const STATUSLINE_PATH = join(SCRIPTS_DIR, 'statusline.py');
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

const OLD_START_MARKER = '<!-- velocity-mcp:start -->';
const OLD_END_MARKER = '<!-- velocity-mcp:end -->';

const CLAUDE_MD_CONTENT = `# WhenLabs Toolkit

## Task Timing (velocity-mcp)

Velocity tools are part of the unified \`whenlabs\` MCP server. Follow these rules for EVERY session:

1. **Before starting any discrete coding task**, call \`velocity_start_task\` with:
   - Appropriate \`category\` (scaffold, implement, refactor, debug, test, config, docs, deploy)
   - Relevant \`tags\` (e.g. typescript, react, sqlite, api)
   - Clear \`description\` of what you're about to do
   - \`estimated_files\` if you know how many files you'll touch
   - \`project\` set to the current project name (auto-detected from git remote or directory name)

2. **After completing each task**, call \`velocity_end_task\` with:
   - The \`task_id\` from the start call
   - \`status\`: completed, failed, or abandoned
   - \`actual_files\`: how many files were actually modified
   - \`notes\`: any useful context about what happened

3. **When creating a multi-step plan**, call \`velocity_estimate\` to provide the user with a time estimate before starting work.

4. **If the user asks about speed or performance**, call \`velocity_stats\` to show aggregate data.

### Guidelines
- Every discrete unit of work should be tracked — don't batch multiple unrelated changes into one task
- If a task is abandoned or fails, still call \`velocity_end_task\` with the appropriate status
- Use consistent tags across sessions so the similarity matching can find comparable historical tasks
- Keep descriptions concise but specific enough to be useful for future matching

## WhenLabs MCP Tools (ALWAYS prefer these over shell commands)

All six tools (including velocity) are available through the unified \`whenlabs\` MCP server. **ALWAYS use these MCP tools instead of running shell commands like lsof, grep, or manual checks.** These tools are purpose-built and give better results:

| When to use | Call this tool | NOT this |
|-------------|---------------|----------|
| Check ports or port conflicts | \`berth_status\` or \`berth_check\` | \`lsof\`, \`netstat\`, \`ss\` |
| Scan dependency licenses | \`vow_scan\` or \`vow_check\` | manual \`npm ls\`, \`license-checker\` |
| Check if docs are stale | \`stale_scan\` | manual file comparison |
| Validate .env files | \`envalid_validate\` or \`envalid_detect\` | manual .env inspection |
| Generate AI context files | \`aware_init\` or \`aware_doctor\` | manual CLAUDE.md creation |

### Tool Reference
- \`berth_status\` — Show all active ports, Docker ports, and configured ports
- \`berth_check\` — Scan a project directory for port conflicts
- \`stale_scan\` — Detect documentation drift in the codebase
- \`envalid_validate\` — Validate .env files against their schema
- \`envalid_detect\` — Find undocumented env vars in codebase
- \`aware_init\` — Auto-detect stack and generate AI context files
- \`aware_doctor\` — Diagnose project health and config issues
- \`vow_scan\` — Scan and summarize all dependency licenses
- \`vow_check\` — Validate licenses against a policy file

### Proactive Background Scans
WhenLabs tools run automatically in the background on a schedule. The status line shows findings:
- \`stale:N\` — N docs have drifted from code. Run \`stale_scan\` and fix the drift.
- \`env:N\` — N .env issues found. Run \`envalid_validate\` and help the user fix them.
- \`ports:N\` — N port conflicts. Run \`berth_status\` and suggest resolution.
- \`lic:N?\` — N packages with unknown licenses. Run \`vow_scan\` for details.
- \`aware:stale\` — AI context files are outdated. Run \`aware_init\` to regenerate.

**When you see any of these in the status line, proactively tell the user and offer to fix the issue.** Do not wait for the user to ask.`;

const STATUSLINE_SCRIPT = `#!/usr/bin/env python3
"""WhenLabs status line for Claude Code — with proactive background tool scans."""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

CACHE_DIR = Path.home() / ".whenlabs" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Scan intervals in seconds
INTERVALS = {
    "berth":   900,   # 15 min
    "stale":   1800,  # 30 min
    "envalid": 1800,  # 30 min
    "vow":     3600,  # 60 min
    "aware":   3600,  # 60 min
}


class C:
    AMBER = "\\033[38;2;196;106;26m"
    BLUE = "\\033[38;2;59;130;246m"
    CYAN = "\\033[38;2;34;211;238m"
    GREEN = "\\033[38;2;34;197;94m"
    RED = "\\033[38;2;239;68;68m"
    YELLOW = "\\033[38;2;234;179;8m"
    GRAY = "\\033[38;2;156;163;175m"
    DIM = "\\033[2m"
    RESET = "\\033[0m"
    SEP = f"\\033[38;2;107;114;128m \\u30fb \\033[0m"


def git_info(cwd):
    try:
        subprocess.run(["git", "rev-parse", "--git-dir"], cwd=cwd, capture_output=True, check=True, timeout=1)
        branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd, capture_output=True, text=True, timeout=1).stdout.strip()
        status = subprocess.run(["git", "status", "--porcelain"], cwd=cwd, capture_output=True, text=True, timeout=1).stdout
        clean = len([l for l in status.strip().split("\\n") if l]) == 0
        color = C.GREEN if clean else C.YELLOW
        icon = "\\u2713" if clean else "\\u00b1"
        return f"{color}{branch} {icon}{C.RESET}"
    except Exception:
        return None


def mcp_servers(data):
    servers = []
    try:
        cfg = Path.home() / ".claude.json"
        if cfg.exists():
            with open(cfg) as f:
                servers.extend(json.load(f).get("mcpServers", {}).keys())
    except Exception:
        pass
    cwd = data.get("workspace", {}).get("current_dir", "")
    if cwd:
        for p in [Path(cwd) / ".mcp.json", Path(cwd) / ".claude" / ".mcp.json"]:
            try:
                if p.exists():
                    with open(p) as f:
                        servers.extend(json.load(f).get("mcpServers", {}).keys())
            except Exception:
                pass
    seen = set()
    return [s for s in servers if not (s in seen or seen.add(s))]


def context_pct(data):
    try:
        cw = data["context_window"]
        size = cw["context_window_size"]
        usage = cw.get("current_usage", {})
        tokens = usage.get("input_tokens", 0) + usage.get("cache_creation_input_tokens", 0) + usage.get("cache_read_input_tokens", 0)
        pct = (tokens * 100) // size
        color = C.GREEN if pct < 40 else C.YELLOW if pct < 70 else C.RED
        return f"{C.DIM}{color}{pct}%{C.RESET}"
    except Exception:
        return None


def cost_info(data):
    try:
        cfg = Path.home() / ".claude.json"
        if cfg.exists():
            with open(cfg) as f:
                if json.load(f).get("oauthAccount", {}).get("accountUuid"):
                    return None
    except Exception:
        pass
    try:
        cost = data.get("cost", {}).get("total_cost_usd")
        if cost:
            color = C.GREEN if cost < 1 else C.YELLOW if cost < 5 else C.RED
            return f"{color}\${cost:.2f}{C.RESET}"
    except Exception:
        pass
    return None


# --- Background tool scanning ---

def cache_path(tool, cwd):
    project = Path(cwd).name if cwd else "global"
    return CACHE_DIR / f"{tool}_{project}.json"


def should_run(tool, cwd):
    cp = cache_path(tool, cwd)
    if not cp.exists():
        return True
    try:
        cached = json.loads(cp.read_text())
        return (time.time() - cached.get("timestamp", 0)) > INTERVALS[tool]
    except Exception:
        return True


def run_bg(tool, args, cwd):
    cp = cache_path(tool, cwd)
    snippet = (
        "import subprocess, json, time, os; "
        f"args = {args!r}; "
        f"cwd = {cwd!r}; "
        f"out_path = {str(cp)!r}; "
        "env = {**os.environ, 'FORCE_COLOR': '0', 'NO_COLOR': '1'}; "
        "r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, env=env, timeout=60); "
        "cache = {'timestamp': time.time(), 'output': r.stdout + r.stderr, 'code': r.returncode}; "
        "open(out_path, 'w').write(json.dumps(cache))"
    )
    try:
        subprocess.Popen(
            [sys.executable, "-c", snippet],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception:
        pass


def read_cache(tool, cwd):
    cp = cache_path(tool, cwd)
    if not cp.exists():
        return None
    try:
        return json.loads(cp.read_text())
    except Exception:
        return None


def parse_stale(cached):
    if not cached or cached["code"] != 0:
        return None
    out = cached["output"]
    drifted = out.count("\\u2717")
    if drifted > 0:
        return f"{C.RED}stale:{drifted}{C.RESET}"
    if "\\u2713" in out or "No drift" in out.lower() or "clean" in out.lower():
        return f"{C.GREEN}stale:ok{C.RESET}"
    return None


def parse_envalid(cached):
    if not cached:
        return None
    out = cached["output"]
    if cached["code"] != 0:
        errors = sum(1 for line in out.split("\\n") if "\\u2717" in line or "error" in line.lower() or "missing" in line.lower())
        if errors > 0:
            return f"{C.RED}env:{errors}{C.RESET}"
        return f"{C.YELLOW}env:?{C.RESET}"
    return f"{C.GREEN}env:ok{C.RESET}"


def parse_berth(cached):
    if not cached:
        return None
    out = cached["output"]
    conflicts = out.lower().count("conflict")
    if conflicts > 0:
        return f"{C.RED}ports:{conflicts}{C.RESET}"
    return None


def parse_vow(cached):
    if not cached:
        return None
    out = cached["output"]
    unknown = 0
    for line in out.split("\\n"):
        low = line.lower()
        if "unknown" in low or "unlicensed" in low:
            for word in line.split():
                if word.isdigit():
                    unknown += int(word)
                    break
            else:
                unknown += 1
    if unknown > 0:
        return f"{C.YELLOW}lic:{unknown}?{C.RESET}"
    return None


def parse_aware(cached):
    if not cached:
        return None
    out = cached["output"]
    if cached["code"] != 0 or "stale" in out.lower() or "outdated" in out.lower() or "drift" in out.lower():
        return f"{C.YELLOW}aware:stale{C.RESET}"
    return None


def run_scans(cwd):
    if not cwd:
        return []

    scans = {
        "stale":   (["npx", "--yes", "@whenlabs/stale", "scan"], parse_stale),
        "envalid": (["npx", "--yes", "@whenlabs/envalid", "validate"], parse_envalid),
        "berth":   (["npx", "--yes", "@whenlabs/berth", "check", "."], parse_berth),
        "vow":     (["npx", "--yes", "@whenlabs/vow", "scan"], parse_vow),
        "aware":   (["npx", "--yes", "@whenlabs/aware", "doctor"], parse_aware),
    }

    for tool, (args, _) in scans.items():
        if should_run(tool, cwd):
            run_bg(tool, args, cwd)
            break

    # Auto-sync aware when staleness detected
    aware_cached = read_cache("aware", cwd)
    if aware_cached:
        out = aware_cached.get("output", "")
        code = aware_cached.get("code", 0)
        if code != 0 or "stale" in out.lower() or "outdated" in out.lower() or "drift" in out.lower() or "never synced" in out.lower():
            sync_cache = cache_path("aware_sync", cwd)
            sync_age = 0
            if sync_cache.exists():
                try:
                    sync_age = time.time() - json.loads(sync_cache.read_text()).get("timestamp", 0)
                except Exception:
                    sync_age = 99999
            else:
                sync_age = 99999
            if sync_age > 3600:  # Only auto-sync once per hour
                run_bg("aware_sync", ["npx", "--yes", "@whenlabs/aware", "sync"], cwd)

    results = []
    for tool, (_, parser) in scans.items():
        cached = read_cache(tool, cwd)
        if cached:
            parsed = parser(cached)
            if parsed:
                results.append(parsed)

    return results


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        return

    parts = []

    cwd = data.get("workspace", {}).get("current_dir", "")
    if cwd:
        parts.append(f"{C.BLUE}{Path(cwd).name}{C.RESET}")

    if cwd:
        g = git_info(cwd)
        if g:
            parts.append(g)

    servers = mcp_servers(data)
    if servers:
        names = " ".join(servers)
        parts.append(f"{C.AMBER}{C.DIM}{names}{C.RESET}")

    c = cost_info(data)
    if c:
        parts.append(c)

    model = data.get("model", {}).get("display_name", "")
    if model:
        short = "".join(ch for ch in model if ch.isalpha()).lower()
        parts.append(f"{C.GRAY}{short}{C.RESET}")

    ctx = context_pct(data)
    if ctx:
        parts.append(ctx)

    ver = data.get("version")
    if ver:
        parts.append(f"{C.DIM}{C.GRAY}v{ver}{C.RESET}")

    scan_results = run_scans(cwd)

    print(C.SEP.join(parts))

    if scan_results:
        print(f"{C.DIM}{C.GRAY}  tools:{C.RESET} {f' {C.DIM}|{C.RESET} '.join(scan_results)}")


if __name__ == "__main__":
    main()
`;

function installStatusLine(): { installed: boolean; message: string } {
  try {
    mkdirSync(SCRIPTS_DIR, { recursive: true });
    writeFileSync(STATUSLINE_PATH, STATUSLINE_SCRIPT, 'utf-8');
    chmodSync(STATUSLINE_PATH, 0o755);

    // Configure Claude Code settings to use the status line
    let settings: Record<string, unknown> = {};
    if (existsSync(SETTINGS_PATH)) {
      try {
        settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    const statuslineCmd = `python3 ${STATUSLINE_PATH}`;
    const currentCmd = (settings as any).statusLine?.command;
    if (currentCmd !== statuslineCmd) {
      (settings as any).statusLine = { type: 'command', command: statuslineCmd };
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    }

    return { installed: true, message: 'Status line installed (proactive background scans)' };
  } catch (err: any) {
    return { installed: false, message: `Status line install failed: ${err.message}` };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasOldBlock(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  return content.includes(OLD_START_MARKER) && content.includes(OLD_END_MARKER);
}

function removeOldBlock(filePath: string): void {
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, 'utf-8');
  const pattern = new RegExp(
    `\\n?${escapeRegex(OLD_START_MARKER)}[\\s\\S]*?${escapeRegex(OLD_END_MARKER)}\\n?`,
    'g',
  );
  content = content.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  writeFileSync(filePath, content, 'utf-8');
}

export interface InstallOptions {
  cursor?: boolean;
  vscode?: boolean;
  windsurf?: boolean;
  all?: boolean;
}

export async function install(options: InstallOptions = {}): Promise<void> {
  console.log('\n🔧 WhenLabs toolkit installer\n');

  const editorFlags = options.all
    ? ALL_EDITORS
    : ([
        options.cursor && 'cursor',
        options.vscode && 'vscode',
        options.windsurf && 'windsurf',
      ].filter(Boolean) as EditorName[]);

  const claudeOnly = editorFlags.length === 0;

  if (claudeOnly) {
    // 1. Register unified MCP server (all 6 tools in one)
    const mcpResult = registerMcpServer();
    console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

    // 2. Inject unified CLAUDE.md block
    injectBlock(CLAUDE_MD_PATH, CLAUDE_MD_CONTENT);
    console.log(`  ✓ CLAUDE.md instructions written to ${CLAUDE_MD_PATH}`);

    // 3. Install status line script (proactive background scans)
    const slResult = installStatusLine();
    console.log(slResult.installed ? `  ✓ ${slResult.message}` : `  ✗ ${slResult.message}`);

    // 4. Run aware init + sync to generate up-to-date AI context files
    try {
      const cwd = process.cwd();
      execFileSync('npx', ['--yes', '@whenlabs/aware', 'init', '--force'], {
        cwd,
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        timeout: 30_000,
      });
      execFileSync('npx', ['--yes', '@whenlabs/aware', 'sync'], {
        cwd,
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        timeout: 30_000,
      });
      console.log('  ✓ AI context files generated and synced (aware init + sync)');
    } catch {
      console.log('  - Skipped aware init (run `when aware init` in a project directory)');
    }

    // 5. Migrate old velocity-mcp standalone markers if present
    if (hasOldBlock(CLAUDE_MD_PATH)) {
      removeOldBlock(CLAUDE_MD_PATH);
      console.log('  ✓ Removed legacy velocity-mcp markers (migrated to whenlabs block)');
    }
  } else {
    for (const editor of editorFlags) {
      const result = installForEditor(editor);
      console.log(result.success ? `  ✓ ${result.message}` : `  ✗ ${result.message}`);
    }
  }

  console.log('\nInstallation complete. Run `when status` to verify.\n');
}
