# Berth

Port & Process Conflict Resolver for Developers. Part of the [WhenLabs](https://whenlabs.org) toolkit.

See every port your dev environment is using, detect conflicts before they happen, and resolve them with one command. Berth scans your running processes, Docker containers, and project config files to give you a unified view of port usage across your entire local development stack.

> **Part of the [WhenLabs toolkit](https://github.com/WhenLabs-org/when)** — install all 6 tools with one command:
> ```
> npx @whenlabs/when install
> ```

## Why berth?

| | berth | lsof / netstat | kill-port |
|---|---|---|---|
| Detects conflicts before starting | Scans configs and running processes together | Only shows what is running now | No conflict detection |
| Reads project config files | Parses `.env`, `docker-compose.yml`, `package.json`, `Procfile` | No config awareness | No config awareness |
| Suggests resolution | Recommends kill, reassign, or remap with one command | Raw process list, figure it out | Kills blindly |
| Unified dashboard | System processes + Docker + project configs in one view | Separate tools for each | Port kill only |
| Framework-aware | Knows default ports for Next.js, Vite, Django, etc. | No framework knowledge | No framework knowledge |

## Features

- **Unified port dashboard** -- view active system processes, Docker containers, and configured project ports in one place
- **Conflict detection** -- automatically find port collisions between running processes, containers, and project configs
- **Smart resolution** -- kill dev processes, reassign ports, and update config files automatically
- **Project registry** -- register projects and their port requirements in `~/.berth/registry.json` for persistent tracking
- **Real-time monitoring** -- watch for port conflicts as they happen with optional desktop notifications
- **Multi-source scanning** -- detects ports from `package.json`, `.env`, `docker-compose.yml`, `Procfile`, `Makefile`, `.devcontainer/devcontainer.json`, and framework defaults
- **Configurable** -- opt into per-project `berth.config.js` with custom ports, aliases, reserved ranges, and plugins
- **Plugin API** -- write your own detectors (k8s, Tilt, mprocs) and register them from your config
- **Port reservations** -- `berth reserve 3000 --for web` so two projects can't claim the same default
- **Team config** -- commit `.berth/team.json` to standardize port assignments across your team
- **Ancestry tracing** -- `berth status --trace` shows which tmux pane / shell / VS Code window started each process
- **History log** -- `berth history` tracks port claims, releases, conflicts, and resolutions over time; flags flapping ports
- **Environment-aware** -- detects WSL2, devcontainers, Docker containers, and SSH sessions; annotates `berth status`
- **Remote visibility** -- `berth remote <host>` shows ports on a remote machine via SSH
- **LLM/agent integration** -- `berth status --mcp` emits an agent-friendly envelope; `berth-mcp` exposes berth as tools to Claude Code, Cursor, Zed, etc.
- **Cross-platform** -- uses `lsof` on macOS/Linux and `netstat` on Windows
- **CI-friendly** -- `berth check` exits with code 1 on conflicts; `--json` flag for machine-readable output
- **`berth predict`** -- Reads `docker-compose.yml`, `package.json` scripts, `.env`, and framework defaults to show what ports the project wants vs what is currently in use:
  ```bash
  berth predict ~/projects/my-app
  ```
  ```
  PORT   WANTED BY              STATUS
  3000   package.json (next dev) ✗ in use (node, PID 4821)
  5432   docker-compose (postgres) ✓ available
  6379   docker-compose (redis)    ✓ available
  ```
- **Docker awareness** -- Distinguishes Docker containers from native processes in all output; shows container name, image, and health status (`healthy`, `unhealthy`, `starting`)
- **Kill suggestions** -- When conflicts are found, berth prints the exact command to resolve them:
  ```
  Conflict: port 3000
    → kill 4821          # node (next-dev)
    → docker stop redis  # redis:7-alpine (port 6379)
  ```

## Install

> **Recommended:** Install the full WhenLabs toolkit with `npx @whenlabs/when install` to get berth plus 5 other tools in one step.

```bash
npm install -g @whenlabs/berth
```

Requires Node.js >= 18.

## Usage

### See everything running

```bash
berth status
```

Shows all active ports (system processes, dev servers), Docker containers, and configured-but-not-running ports from registered projects. Displays a summary with conflict count.

### Check a project for conflicts

```bash
berth check ~/projects/my-app
```

Scans the project directory for port requirements and cross-references against what is currently running. Exit code 1 if conflicts are found (CI-friendly). Includes suggested fixes.

### Kill processes on a port

```bash
# Kill whatever is on port 3000
berth kill 3000

# Kill all dev processes (node, deno, bun, python, ruby, etc.)
berth kill --dev

# Skip confirmation
berth kill 3000 --force
```

Dev processes (node, vite, next, webpack, etc.) are distinguished from system services (postgres, redis, nginx) and handled accordingly.

### Register a project

```bash
cd ~/projects/my-app
berth register

# Or specify a directory
berth register --dir ~/projects/my-app

# Skip confirmation
berth register --yes
```

Scans the directory and records port requirements in `~/.berth/registry.json`.

### List registered projects

```bash
berth list
```

Shows all registered projects with their ports and running status (running, partial, stopped).

### Free ports for a project

```bash
berth free my-app
```

Kills all active processes on ports registered to the given project.

### Reassign a port

```bash
berth reassign 3000 3001 --project my-app
```

Updates `.env`, `docker-compose.yml`, and `package.json` with the new port number. Handles `PORT=`, `--port`, `-p`, and URL patterns contextually.

### Resolve port conflicts

```bash
# Auto-detect and resolve conflicts in the current directory
berth resolve

# Resolve conflicts in a specific project directory
berth resolve ~/projects/my-app

# Preview what would happen without making changes
berth resolve --dry-run

# Allow killing blocking processes
berth resolve --kill

# Choose a strategy: kill, reassign, or auto (default)
berth resolve --strategy kill
berth resolve --strategy reassign
berth resolve --strategy auto
```

Scans the project directory for port conflicts and resolves them automatically. The `auto` strategy kills dev processes and reassigns ports for system services. Use `--dry-run` to preview changes.

### Auto-resolve conflicts

```bash
berth start my-app
berth start my-app --dry-run
```

Automatically resolves conflicts for a registered project: kills dev processes, remaps ports, and updates config files. Use `--dry-run` to preview changes without applying them.

### Watch for conflicts

```bash
berth watch
berth watch --interval 10
berth watch --notify
```

Monitors for port conflicts in real-time with configurable polling interval. The `--notify` flag sends desktop notifications (via `node-notifier`) when new conflicts are detected.

### Diagnose your setup

```bash
berth doctor                  # traffic-light health check
berth doctor --fix            # offer to auto-resolve conflicts
```

Inspects Node version, `lsof`/`netstat` availability, Docker reachability, registry schema, environment (WSL/devcontainer/SSH), history log size, team config schema, project berth config, conflicts in cwd, and long-running (>24h) listening processes. JSON-friendly; exits 1 on error-severity findings.

### Shell hook (ambient cd warnings)

```bash
berth install-shell-hook               # auto-detects $SHELL
berth install-shell-hook --shell zsh
berth install-shell-hook --print       # dump the hook without writing
berth install-shell-hook --uninstall
```

Appends a marker-delimited block to your shell rc (`~/.bashrc` / `~/.zshrc` / `~/.config/fish/config.fish`). On every `cd`, berth runs `check --quick --silent` in the background and prints a one-line warning to stderr if configured ports are already held. Perceived `cd` latency is ~15 ms (the warning arrives ~400 ms later if there's a conflict). Idempotent — reinstalling replaces the existing block.

### Create a config file

```bash
berth init                    # writes berth.config.js in the current dir
berth init --format mjs
berth init --format json      # writes .berthrc.json instead
berth init --force            # overwrite existing config
```

Generates a starter config pre-filled with ports berth auto-detected. Edit it to declare canonical ports, disable specific framework defaults, reserve port ranges, or load plugins. See [Configuration](#configuration) below.

### Reserve a port

```bash
berth reserve 3000 --for web --reason "primary dev server"
berth reserve 4000 --for api --expires 7d
berth unreserve 3000
berth reservations                # list active reservations
```

Reservations live in `~/.berth/registry.json`. A configured port claimed by a project other than the reservation owner becomes an error-severity conflict. Optional TTLs (`1h`, `7d`, `2w`) auto-expire.

### Team config

```bash
berth team show                   # print merged team config
berth team lint                   # validate .berth/team.json (CI-friendly; exits 1 on schema error)
berth team claim web 3000 --role frontend --owner "@squad"
```

Commit `.berth/team.json` to the repo to standardize ports across your team. Supports `assignments`, `reservedRanges`, `forbidden`, and `policies` (e.g. `killBlockingProcesses: 'never'` hard-disables `berth resolve --kill`). Team reservations merge additively with personal reservations and never override them.

### Port history

```bash
berth history                     # last 250 events
berth history 3000                # only port 3000
berth history --since 1h          # last hour
berth history --since 7d          # last week
berth history --flapping          # ports with ≥3 claim/release events
berth history --type resolution-applied
```

Every `berth status`, `berth resolve`, and reservation change is appended to `~/.berth/history.jsonl`. The log rotates at 10 MB.

### Process ancestry (`--trace`)

```bash
berth status --trace
```

Resolves each active process's parent shell, tmux/screen pane, and start time so you know which terminal to kill:

```
Port 3000  PID 42156  node  native  myapp  0.0.0.0
    → tmux pane %42 · started 14:32
```

Opt-in because it fans out `ps` per PID. Linux reads `/proc/<pid>/environ`; macOS uses `ps -E` (privilege-dependent; falls back to parent-command matching). Works on Windows via `wmic` (parents only).

### Remote host status

```bash
berth remote staging              # runs `berth status --json` via SSH
berth remote staging -p 2222 -i ~/.ssh/id_ed25519
berth remote staging --no-fallback
```

Reports the remote host's port state with `project: "@<host>"` annotations. Falls back to parsing `ss -tlnp` when berth isn't installed on the remote. No port forwarding — visibility only.

### LLM agents (MCP)

```bash
berth status --mcp                # wraps JSON output with {schema, data, hints} for LLM agents
berth check --mcp ~/proj          # same envelope for check output

berth-mcp                         # start an MCP stdio server (add to your agent's config)
```

Wire `berth-mcp` into Claude Code, Cursor, Zed, or any other MCP client to expose 6 tools:

| Tool | Description |
|---|---|
| `berth.status` | Dashboard of active/docker ports with hints |
| `berth.check` | Scan a project directory for conflicts |
| `berth.history` | Read the port-history log |
| `berth.reserve` | Reserve a port for a project |
| `berth.unreserve` | Remove a reservation |
| `berth.kill` | **Destructive.** Returns a dry-run plan unless called with `confirm: true` |

All confirmed kills via MCP are logged to `~/.berth/history.jsonl`.

## Global Options

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--verbose` | Show detailed debug output |
| `--no-color` | Disable colored output |

## Port Detection Sources

**Active** (what is running now):
- OS processes via `lsof` (macOS/Linux) or `netstat` (Windows)
- Docker containers via `docker ps`

**Configured** (what wants to run):
- `berth.config.js` / `.berthrc.json` (highest priority, always high confidence)
- `package.json` scripts (`--port`, `-p`, `PORT=`)
- `.env` / `.env.local` / `.env.development` files
- `docker-compose.yml` / `compose.yml` port mappings
- `.devcontainer/devcontainer.json` (`forwardPorts`, `appPort`, `portsAttributes`)
- `Procfile` commands
- `Makefile` recipe commands
- Framework defaults (Next.js 3000, Vite 5173, Angular 4200, Astro 4321, Storybook 6006, Django 8000, and more)
- Any custom detector registered via a plugin (see [Configuration](#configuration))

### Supported Framework Defaults

Berth automatically detects default ports for the following frameworks by inspecting dependencies and config files:

Next.js, Vite, Create React App, Angular, Vue CLI, Storybook, Remix, Astro, Nuxt, Gatsby, SvelteKit, Webpack Dev Server, Parcel, Django, Flask, FastAPI, Rails

## Configuration

### `berth.config.js`

Drop a `berth.config.js` (or `.mjs` / `.cjs` / `.berthrc.json` / `package.json#berth`) in your project root. Berth walks upward from `cwd` looking for it, stopping at `.git` or `$HOME`.

```js
// berth.config.js
import { defineConfig } from '@whenlabs/berth';

export default defineConfig({
  projectName: 'my-monorepo',
  ports: {
    web: 3000,
    api: { port: 4000, required: true, description: 'GraphQL API' },
    worker: 4100,
  },
  reservedRanges: [
    { from: 5000, to: 5010, reason: 'local database pool' },
  ],
  frameworks: {
    disable: ['Express'],              // don't use Express's default port
    override: { Vite: 5174 },          // use 5174 instead of Vite's default 5173
  },
  plugins: [
    './scripts/berth-k8s-plugin.js',   // resolved relative to the config file
  ],
});
```

The file supports `extends: "./base.config.js"`; local values win over the extended base.

### Writing a plugin

Plugins register detectors via the shared plugin registry:

```js
// scripts/berth-k8s-plugin.js
export default function plugin(registry) {
  registry.registerConfigured({
    name: 'k8s',
    kind: 'configured',
    async detect({ dir }) {
      // ...parse k8s/**/*.yaml for Service ports...
      return [{
        port: 30080,
        source: 'docker-compose',        // closest existing source family
        sourceFile: `${dir}/k8s/web.yaml`,
        context: 'Service web → nodePort',
        projectDir: dir,
        projectName: 'web',
        confidence: 'high',
      }];
    },
  });
}
```

Plugins can also replace existing builtins by re-registering the same name, or remove them via `registry.unregister(name)`.

### Team config (`.berth/team.json`)

```json
{
  "version": 1,
  "assignments": [
    { "port": 3000, "project": "web", "role": "frontend" },
    { "port": 4000, "project": "api", "role": "backend" }
  ],
  "reservedRanges": [
    { "from": 5000, "to": 5010, "purpose": "database pool" }
  ],
  "forbidden": [
    { "port": 5000, "reason": "conflicts with company VPN" }
  ],
  "policies": {
    "killBlockingProcesses": "devOnly",
    "onConflict": "error"
  }
}
```

- **`assignments`** → treated as team-sourced reservations in conflict detection
- **`reservedRanges`** → any configured port inside the range that isn't an explicit team assignment produces a warning
- **`forbidden`** → ports that must not be used anywhere in the repo
- **`policies.killBlockingProcesses`** → `'never' | 'devOnly' | 'always'`. `'never'` hard-disables `berth resolve --kill`; `'always'` allows kills without the flag
- **`policies.onConflict: 'error'`** → escalates all warnings to errors (strict CI mode)

Run `berth team lint` as a pre-commit hook to validate the schema.

## Project Structure

```
src/
  cli.ts                            # Main CLI entry (commander setup)
  version.ts                        # Version read from package.json
  index.ts                          # Public package exports
  types.ts                          # TypeScript type definitions
  tool.ts                           # @whenlabs/core Tool adapter
  commands/
    _context.ts                     # buildScanContext — config + plugins + reservations + team
    status|check|kill|free|list.ts
    register|reassign|resolve|start|watch.ts
    init.ts                         # berth init
    reserve|unreserve|reservations.ts
    team.ts                         # berth team show|lint|claim
    remote.ts                       # berth remote <host>
    history.ts                      # berth history
  config/
    schema.ts                       # Config candidates + defineConfig()
    validate.ts                     # Hand-written BerthConfig validator
    loader.ts                       # Upward-walk config discovery
    plugins.ts                      # Plugin loader (createRequire-based)
    team.ts                         # .berth/team.json schema + loader
  detectors/
    api.ts                          # Plugin API types + defineXDetector helpers
    registry.ts                     # DetectorRegistry
    builtins.ts                     # Wraps all builtins as plugins
    index.ts                        # detectAllActive / detectAllConfigured
    active/
      lsof|netstat|docker.ts
    configured/
      dotenv|package-json|docker-compose|procfile|makefile|framework.ts
      berthrc.ts                    # ports from berth.config
      devcontainer.ts               # .devcontainer/devcontainer.json parser
  history/
    events.ts                       # HistoryEvent discriminated union
    recorder.ts                     # JSONL append + rotation + diff snapshots
  mcp/
    server.ts                       # McpServer wiring all tools
    cli.ts                          # berth-mcp binary entry
  registry/
    store.ts                        # Registry v1→v2 migration + atomic writes
    project.ts                      # Project lookup helpers
    reservations.ts                 # Reservation CRUD + TTL parser
  resolver/
    conflicts.ts                    # detectConflicts + detectAllConflicts
    suggestions.ts                  # Resolution suggestion engine
    actions.ts                      # Kill, reassign, free actions
  reporters/
    terminal.ts                     # chalk + cli-table3 output
    json.ts                         # JSON formatter
    mcp.ts                          # {schema, data, hints} envelope
  utils/
    platform.ts                     # Platform detection, shellExec
    ports.ts                        # Port validation, findFreePort, framework defaults
    process.ts                      # Process classification, graceful kill
    ancestry.ts                     # ps walk + terminal detection
    environment.ts                  # host/wsl2/devcontainer/docker/ssh detection
tests/
  commands/ config/ detectors/ history/ mcp/
  registry/ reporters/ resolver/ utils/
```

## Tech Stack

- **Language**: TypeScript (ES2022, ESM, strict)
- **CLI Framework**: [Commander.js](https://github.com/tj/commander.js)
- **Build**: [tsup](https://github.com/egoist/tsup) (three ESM entries: `cli.js`, `mcp.js`, `index.js`, Node 18 target)
- **Test**: [Vitest](https://vitest.dev/)
- **Output**: [chalk](https://github.com/chalk/chalk) + [cli-table3](https://github.com/cli-table/cli-table3)
- **Config Parsing**: [dotenv](https://github.com/motdotla/dotenv), [yaml](https://github.com/eemeli/yaml), [jsonc-parser](https://github.com/microsoft/node-jsonc-parser)
- **MCP**: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) + [zod](https://github.com/colinhacks/zod) (for `berth-mcp`)
- **Notifications**: [node-notifier](https://github.com/mikaelbr/node-notifier) (optional, for `berth watch --notify`)

## Development

```bash
npm install
npm run dev -- status        # Run in development
npm test                     # Run tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage
npm run build                # Build for production
npm run typecheck            # Type check
```

## License

MIT
