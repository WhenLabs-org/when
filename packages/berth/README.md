# Berth

Port & Process Conflict Resolver for Developers. Part of the [WhenLabs](https://whenlabs.org) toolkit.

See every port your dev environment is using, detect conflicts before they happen, and resolve them with one command. Berth scans your running processes, Docker containers, and project config files to give you a unified view of port usage across your entire local development stack.

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
- **Multi-source scanning** -- detects ports from `package.json`, `.env`, `docker-compose.yml`, `Procfile`, `Makefile`, and framework defaults
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

```bash
npm install -g berth
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
- `package.json` scripts (`--port`, `-p`, `PORT=`)
- `.env` / `.env.local` / `.env.development` files
- `docker-compose.yml` / `compose.yml` port mappings
- `Procfile` commands
- `Makefile` recipe commands
- Framework defaults (Next.js 3000, Vite 5173, Angular 4200, Astro 4321, Storybook 6006, Django 8000, and more)

### Supported Framework Defaults

Berth automatically detects default ports for the following frameworks by inspecting dependencies and config files:

Next.js, Vite, Create React App, Angular, Vue CLI, Storybook, Remix, Astro, Nuxt, Gatsby, SvelteKit, Webpack Dev Server, Parcel, Django, Flask, FastAPI, Rails

## Project Structure

```
berth-tool/
  src/
    cli.ts                          # CLI entry point (commander setup)
    types.ts                        # TypeScript type definitions
    errors.ts                       # Custom error classes
    commands/
      status.ts                     # berth status
      check.ts                      # berth check
      kill.ts                       # berth kill
      free.ts                       # berth free
      register.ts                   # berth register
      list.ts                       # berth list
      reassign.ts                   # berth reassign
      resolve.ts                    # berth resolve (auto-resolve conflicts)
      start.ts                      # berth start
      watch.ts                      # berth watch
    detectors/
      index.ts                      # Detector orchestrator
      active/
        lsof.ts                     # macOS/Linux port detection via lsof
        netstat.ts                  # Windows port detection via netstat
        docker.ts                   # Docker container port detection
      configured/
        dotenv.ts                   # .env file scanner
        package-json.ts             # package.json script scanner
        docker-compose.ts           # docker-compose.yml scanner
        procfile.ts                 # Procfile scanner
        makefile.ts                 # Makefile scanner
        framework.ts               # Framework default port detection
    registry/
      store.ts                      # Registry file I/O (~/.berth/registry.json)
      project.ts                    # Project lookup helpers
    resolver/
      conflicts.ts                  # Conflict detection algorithm
      suggestions.ts                # Resolution suggestion engine
      actions.ts                    # Kill, reassign, and free port actions
    reporters/
      terminal.ts                   # Colored terminal output (chalk + cli-table3)
      json.ts                       # JSON output formatter
    utils/
      platform.ts                   # Platform detection, shell exec, Docker availability
      ports.ts                      # Port validation, free port finder, framework defaults
      process.ts                    # Process classification, graceful kill
  tests/
    commands/                       # Command integration tests
    detectors/                      # Detector unit tests
    registry/                       # Registry store tests
    resolver/                       # Conflict and action tests
```

## Tech Stack

- **Language**: TypeScript (ES2022, ESM)
- **CLI Framework**: [Commander.js](https://github.com/tj/commander.js)
- **Build**: [tsup](https://github.com/egoist/tsup) (single ESM bundle with Node 18 target)
- **Test**: [Vitest](https://vitest.dev/)
- **Output**: [chalk](https://github.com/chalk/chalk) + [cli-table3](https://github.com/cli-table/cli-table3)
- **Config Parsing**: [dotenv](https://github.com/motdotla/dotenv), [yaml](https://github.com/eemeli/yaml), [jsonc-parser](https://github.com/microsoft/node-jsonc-parser)
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
