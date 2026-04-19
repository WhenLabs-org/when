# Berth — Current Spec & Roadmap

## What It Is

Berth is a CLI tool that shows every port your dev environment is using, detects conflicts before they happen, and gives you one-command resolution. Think of it as `htop` for your local dev server ports.

Part of the WhenLabs suite at whenlabs.org.

---

## Current State (v0.1.0)

### Commands

| Command | Description |
|---------|-------------|
| `berth status` | Dashboard of all active ports, Docker ports, and configured-but-not-running ports |
| `berth check [dir]` | Scan a project directory for port conflicts. Exit code 1 if conflicts (CI-friendly) |
| `berth kill [port]` | Kill processes on a port. `--dev` kills all dev processes, `--force` skips confirmation |
| `berth free <project>` | Free all ports for a registered project |
| `berth register` | Register current directory's port requirements into ~/.berth/registry.json |
| `berth list` | List all registered projects and their running/stopped status |
| `berth reassign <old> <new>` | Remap a port in config files (.env, docker-compose, package.json) |
| `berth start <project>` | Auto-resolve conflicts and prepare a project. `--dry-run` for preview |
| `berth watch` | Real-time conflict monitoring. `--notify` for desktop notifications, `-i` for interval |

### Global Flags

- `--json` — Machine-readable JSON output on all commands
- `--verbose` — Detailed debug output
- `--no-color` — Disable colored output

### Port Detection Sources

**Active (what's running now):**
- OS processes via `lsof -i -P -n -sTCP:LISTEN` (macOS/Linux)
- OS processes via `netstat -ano -p TCP` (Windows)
- Docker containers via `docker ps`

**Configured (what wants to run):**
- `package.json` scripts — `--port`, `-p`, `PORT=`, framework dependency detection
- `.env` / `.env.local` / `.env.development` / `.env.dev` — PORT keys and URL parsing
- `docker-compose.yml` / `compose.yml` — short/long syntax, port ranges, variable defaults
- `Procfile` — command parsing
- `Makefile` — target recipe scanning
- Framework defaults — Next.js (3000), Vite (5173), Angular (4200), Django (8000), etc.

### Tech Stack

- TypeScript (ESM), Commander.js, Chalk, cli-table3
- tsup build → single 70KB bundle
- Vitest — 79 tests across 14 files
- GitHub Actions CI — Node 18/20/22, Ubuntu + macOS
- npm publish workflow on GitHub releases

### Architecture

```
src/
├── cli.ts                          # Commander entry point
├── types.ts                        # All shared interfaces
├── errors.ts                       # BerthError hierarchy
├── commands/                       # 9 commands (status, check, kill, free, register, list, reassign, start, watch)
├── detectors/
│   ├── index.ts                    # Orchestrator — runs detectors in parallel
│   ├── active/                     # lsof, netstat, docker
│   └── configured/                 # dotenv, package-json, docker-compose, procfile, makefile, framework
├── resolver/
│   ├── conflicts.ts                # Port conflict detection
│   ├── suggestions.ts              # Resolution suggestions
│   └── actions.ts                  # Kill, reassign, remap execution
├── registry/
│   ├── store.ts                    # ~/.berth/registry.json (atomic writes, corrupt recovery)
│   └── project.ts                  # Project registration logic
├── reporters/
│   ├── terminal.ts                 # Chalk + cli-table3 pretty output
│   └── json.ts                     # JSON formatter
└── utils/
    ├── platform.ts                 # shellExec (execFile, no injection), OS detection
    ├── process.ts                  # gracefulKill, isDevProcess heuristic
    └── ports.ts                    # Validation, findFreePort, framework defaults, well-known ports
```

---

## What's Next

### Short Term (v0.2)

- [ ] **npm publish** — Ship to registry as `berth`. Requires npm 2FA setup.
- [ ] **Homebrew tap** — `brew install whenlabs/tap/berth` for non-npm users. Create `homebrew-tap` repo under WhenLabs-org, formula downloads the npm tarball or a standalone binary.
- [ ] **Standalone binary** — Use Node.js SEA (Single Executable Applications) or `bun build --compile` to produce a single binary for macOS/Linux without requiring Node.js.
- [ ] **Edge case hardening** — Test against real-world monorepos, Turborepo/Nx workspaces, projects with dozens of services.

### Medium Term (v0.3)

- [ ] **Project groups** — `berth start fullstack` starts frontend + backend + database together. Define groups in registry.
- [ ] **Port reservation** — `berth reserve 3000 my-frontend` permanently claims a port. Other projects get warned.
- [ ] **Config file generation** — `berth init` creates a `.berthrc` in the project with explicit port declarations, overriding auto-detection.
- [ ] **Shell integration** — Auto-run `berth check .` before `npm run dev` via shell hooks (bash/zsh preexec).
- [ ] **VS Code extension** — Status bar showing active ports, inline conflict warnings in .env and docker-compose files.

### Long Term (v1.0)

- [ ] **Team edition** — Shared port registry synced via a JSON file in the repo or via whenlabs.org cloud. Everyone on the team uses the same port assignments. $9/mo.
- [ ] **Web dashboard** — Visual port map at whenlabs.org showing all your machines and their port usage.
- [ ] **CI integration** — `berth check` as a GitHub Action that fails PRs introducing port conflicts.
- [ ] **Docker Compose rewriter** — Automatically fix port conflicts in compose files without manual editing.
- [ ] **Process manager integration** — Hook into pm2, foreman, overmind to auto-resolve conflicts at startup.
- [ ] **Windows native support** — Full testing and polish for Windows (netstat path works but is less tested).

### Marketing

- Blog post: **"I Wasted 200 Hours of My Life Running `lsof -i :3000`. So I Built This."**
- Landing page on whenlabs.org/berth
- Cross-promotion with other WhenLabs tools
