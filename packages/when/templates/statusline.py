#!/usr/bin/env python3
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
    AMBER = "\033[38;2;196;106;26m"
    BLUE = "\033[38;2;59;130;246m"
    CYAN = "\033[38;2;34;211;238m"
    GREEN = "\033[38;2;34;197;94m"
    RED = "\033[38;2;239;68;68m"
    YELLOW = "\033[38;2;234;179;8m"
    GRAY = "\033[38;2;156;163;175m"
    DIM = "\033[2m"
    RESET = "\033[0m"
    SEP = f"\033[38;2;107;114;128m \u30fb \033[0m"


def git_info(cwd):
    try:
        subprocess.run(["git", "rev-parse", "--git-dir"], cwd=cwd, capture_output=True, check=True, timeout=1)
        branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd, capture_output=True, text=True, timeout=1).stdout.strip()
        status = subprocess.run(["git", "status", "--porcelain"], cwd=cwd, capture_output=True, text=True, timeout=1).stdout
        clean = len([l for l in status.strip().split("\n") if l]) == 0
        color = C.GREEN if clean else C.YELLOW
        icon = "\u2713" if clean else "\u00b1"
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
            return f"{color}${cost:.2f}{C.RESET}"
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
    drifted = out.count("\u2717")
    if drifted > 0:
        return f"{C.RED}stale:{drifted}{C.RESET}"
    if "\u2713" in out or "No drift" in out.lower() or "clean" in out.lower():
        return f"{C.GREEN}stale:ok{C.RESET}"
    return None


def parse_envalid(cached):
    if not cached:
        return None
    out = cached["output"]
    if cached["code"] != 0:
        errors = sum(1 for line in out.split("\n") if "\u2717" in line or "error" in line.lower() or "missing" in line.lower())
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
    for line in out.split("\n"):
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
