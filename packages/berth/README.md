# Berth

Port & Process Conflict Resolver for Developers.

See every port your dev environment is using, detect conflicts before they happen, and resolve them with one command.

## Install

```bash
npm install -g berth
```

## Usage

### See everything running

```bash
berth status
```

Shows all active ports (system processes, dev servers), Docker containers, and configured-but-not-running ports from registered projects.

### Check a project for conflicts

```bash
berth check ~/projects/my-app
```

Scans `package.json`, `.env`, `docker-compose.yml`, and `Procfile` for port requirements and cross-references against what's currently running. Exit code 1 if conflicts found (CI-friendly).

### Kill processes on a port

```bash
# Kill whatever is on port 3000
berth kill 3000

# Kill all dev processes (node, deno, bun, etc.)
berth kill 0 --dev

# Skip confirmation
berth kill 3000 --force
```

### Register a project

```bash
cd ~/projects/my-app
berth register
```

Scans the directory and records port requirements in `~/.berth/registry.json`.

### List registered projects

```bash
berth list
```

### Free ports for a project

```bash
berth free my-app
```

Kills all active processes on ports registered to `my-app`.

### Reassign a port

```bash
berth reassign 3000 3001 --project my-app
```

Updates `.env`, `docker-compose.yml`, and `package.json` with the new port.

### Auto-resolve conflicts

```bash
berth start my-app
berth start my-app --dry-run
```

Automatically resolves conflicts: kills dev processes, remaps ports, updates config files.

## Global Options

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--verbose` | Show detailed debug output |
| `--no-color` | Disable colored output |

## Port Detection Sources

**Active** (what's running now):
- OS processes via `lsof` (macOS/Linux) or `netstat` (Windows)
- Docker containers via `docker ps`

**Configured** (what wants to run):
- `package.json` scripts (`--port`, `-p`, `PORT=`)
- `.env` / `.env.local` / `.env.development` files
- `docker-compose.yml` / `compose.yml` port mappings
- `Procfile` commands
- Framework defaults (Next.js 3000, Vite 5173, Angular 4200, etc.)

## Development

```bash
npm install
npm run dev -- status        # Run in development
npm test                     # Run tests
npm run build                # Build for production
npm run typecheck             # Type check
```

## License

MIT
