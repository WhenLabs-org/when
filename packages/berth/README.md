# Berth

Port & Process Conflict Resolver for Developers. Part of the [WhenLabs](https://whenlabs.org) toolkit.

See every port your dev environment is using, detect conflicts before they happen, and resolve them with one command. Berth scans your running processes, Docker containers, and project config files to give you a unified view of port usage across your local development stack.

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

- **Unified port dashboard** — view active system processes, Docker containers, and configured project ports in one place
- **Conflict detection** — automatically find port collisions between running processes, containers, and project configs
- **Smart resolution** — kill dev processes, reassign ports, and update config files automatically
- **Multi-source scanning** — detects ports from `package.json`, `.env`, `docker-compose.yml`, `Procfile`, `Makefile`, `.devcontainer/devcontainer.json`, and framework defaults
- **Configurable** — opt into per-project `berth.config.js` with custom ports, aliases, reserved ranges, and plugins
- **Plugin API** — write your own detectors (k8s, Tilt, mprocs) and register them from your config
- **Ancestry tracing** — `berth status --trace` shows which tmux pane / shell / VS Code window started each process
- **Environment-aware** — detects WSL2, devcontainers, Docker containers, and SSH sessions; annotates `berth status`
- **Docker awareness** — distinguishes Docker containers from native processes; shows container name, image, and health status (`healthy`, `unhealthy`, `starting`)
- **Cross-platform** — uses `lsof` on macOS/Linux and `netstat` on Windows
- **CI-friendly** — `berth check` exits with code 1 on conflicts; `--json` flag for machine-readable output
- **LLM/agent integration** — `--mcp` flag wraps output in a `{schema, data, hints}` envelope for agents; full MCP tooling is provided via the [`@whenlabs/when`](../when) umbrella server

## Install

> **Recommended:** Install the full WhenLabs toolkit with `npx @whenlabs/when install` to get berth plus 5 other tools in one step.

```bash
npm install -g @whenlabs/berth
```

Requires Node.js >= 18.

## Usage

### `berth status`

```bash
berth status
berth status --trace        # also resolve process ancestry
berth status --mcp          # emit a {schema, data, hints} envelope for LLM agents
```

Shows all active ports (system processes, dev servers) and Docker containers. Displays a summary with conflict count.

With `--trace`, berth resolves each active process's parent shell, tmux/screen pane, and start time so you know which terminal to kill. Opt-in because it fans out `ps` per PID.

### `berth check [dir]`

```bash
berth check ~/projects/my-app
berth check --fix           # automatically resolve detected conflicts
berth check --mcp           # machine-readable envelope for agents
```

Scans the project directory for port requirements and cross-references against what is currently running. Exit code 1 if conflicts are found (CI-friendly). Includes suggested fixes.

### `berth kill [port]`

```bash
berth kill 3000             # kill whatever is on port 3000
berth kill --dev            # kill all dev processes (node, deno, bun, python, ruby, etc.)
berth kill 3000 --force     # skip confirmation
```

Dev processes (node, vite, next, webpack, etc.) are distinguished from system services (postgres, redis, nginx) and handled accordingly.

### `berth reassign <oldPort> <newPort>`

```bash
berth reassign 3000 3001
berth reassign 3000 3001 --dry-run
```

Updates `.env`, `docker-compose.yml`, and `package.json` in the current directory with the new port number. Handles `PORT=`, `--port`, `-p`, and URL patterns contextually.

### `berth resolve [dir]`

```bash
berth resolve                        # resolve conflicts in cwd
berth resolve ~/projects/my-app
berth resolve --dry-run              # preview changes without applying
berth resolve --kill                 # allow killing blocking processes
berth resolve --strategy kill        # force kill
berth resolve --strategy reassign    # force reassign
berth resolve --strategy auto        # default: kill dev processes, reassign system services
```

Detects and auto-resolves port conflicts. The `auto` strategy kills dev processes and reassigns ports for system services.

### `berth init`

```bash
berth init                    # writes berth.config.js in the current dir
berth init --format mjs
berth init --format json      # writes .berthrc.json instead
berth init --force            # overwrite existing config
```

Generates a starter config pre-filled with ports berth auto-detected. Edit it to declare canonical ports, disable specific framework defaults, reserve port ranges, or load plugins. See [Configuration](#configuration) below.

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

## Tech Stack

- **Language**: TypeScript (ES2022, ESM, strict)
- **CLI Framework**: [Commander.js](https://github.com/tj/commander.js)
- **Build**: [tsup](https://github.com/egoist/tsup) (Node 18 target)
- **Test**: [Vitest](https://vitest.dev/)
- **Output**: [chalk](https://github.com/chalk/chalk) + [cli-table3](https://github.com/cli-table/cli-table3)
- **Config Parsing**: [dotenv](https://github.com/motdotla/dotenv), [yaml](https://github.com/eemeli/yaml), [jsonc-parser](https://github.com/microsoft/node-jsonc-parser)

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
