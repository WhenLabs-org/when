# velocity-mcp

An MCP server that gives coding agents self-awareness of their own execution speed, enabling time-based planning and estimation.

> **Note:** velocity is now bundled into [`@whenlabs/when`](https://github.com/WhenLabs-org/when). Running `npx @whenlabs/when install` gives you velocity plus five other tools in a single MCP server. This standalone package is still maintained for users who only want velocity.

Coding agents (Claude Code, Cursor, Codex, etc.) have no concept of time. They plan in terms of tasks but cannot estimate how long those tasks will take to execute. Every completed task is a data point about the agent's throughput -- but that data evaporates after each session. velocity-mcp fixes this by recording task-level execution telemetry, categorizing tasks, and estimating future plan duration based on historical performance.

## Features

- **Task timing** -- start and stop timers around discrete coding tasks
- **Hybrid taxonomy** -- 8 fixed categories (scaffold, implement, refactor, debug, test, config, docs, deploy) plus free-form tags
- **Historical estimation** -- predict how long a multi-step plan will take based on your past performance
- **Similarity matching** -- Jaccard similarity on tags, file count proximity, and recency weighting to find comparable historical tasks
- **Aggregate stats** -- query performance data grouped by category, tag, project, day, or week
- **Task history** -- review recent task records with full metadata
- **Confidence tiers** -- estimates report confidence (high/medium/low/none) based on sample size
- **Git diff stats** -- `velocity_end_task` captures lines added/removed/files changed from `git diff --stat` and stores them with the task record; `velocity_stats` reports `lines_per_minute` throughput
- **Confidence intervals** -- `velocity_estimate` returns a p25–p75 range, median duration, and confidence level (high/medium/low/none based on similar task count)
- **Local persistence** -- all data stored in SQLite at `~/.velocity-mcp/velocity.db` (or `.velocity/velocity.db` project-local)
- **Global install** -- one command to track velocity across every Claude Code session
- **Auto project detection** -- automatically detects project name from git remote or directory

## Tech Stack

- **Runtime:** Node.js (>=18) with TypeScript (ES2022, Node16 modules)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Database:** `better-sqlite3` (WAL mode, zero-config)
- **Validation:** `zod`
- **IDs:** `uuid` v4
- **Transport:** stdio
- **Testing:** Vitest

## Installation

### Via WhenLabs toolkit (recommended)

Get velocity plus five other developer tools in a single MCP server:

```bash
npx @whenlabs/when install
```

### Standalone Install

If you only want velocity:

```bash
npx velocity-mcp install
```

This will:
1. Register velocity-mcp as a global MCP server
2. Add task timing instructions to your `~/.claude/CLAUDE.md`
3. Auto-detect project names from git remotes

To uninstall: `npx velocity-mcp uninstall`

### Per-Project (Claude Code)

```bash
claude mcp add velocity-mcp -- npx velocity-mcp
```

### Cursor / VS Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "velocity-mcp": {
      "command": "npx",
      "args": ["velocity-mcp"]
    }
  }
}
```

### Any MCP Client

```bash
npx velocity-mcp
```

### From Source

```bash
git clone <repo-url>
cd velocity-mcp
npm install
npm run build
npm start
```

## MCP Tools

### `velocity_start_task`

Begin timing a coding task.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | No | Unique ID (auto-generated if omitted) |
| `category` | enum | Yes | `scaffold`, `implement`, `refactor`, `debug`, `test`, `config`, `docs`, or `deploy` |
| `description` | string | Yes | Short description of the task |
| `tags` | string[] | No | Free-form tags for matching (e.g. `typescript`, `react`) |
| `estimated_files` | number | No | Expected number of files to touch |
| `project` | string | No | Project identifier (auto-detected from git remote if omitted) |

### `velocity_end_task`

Stop timing a task and record the result. Returns duration, and compares against historical performance for completed tasks.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | Yes | The task ID to end |
| `status` | enum | Yes | `completed`, `failed`, or `abandoned` |
| `actual_files` | number | No | Files actually modified |
| `notes` | string | No | Additional context |

### `velocity_estimate`

Estimate how long a multi-step plan will take based on historical data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `plan` | array | Yes | List of planned tasks, each with `category`, optional `tags`, `description`, and optional `estimated_files` |

Returns per-task estimates with confidence levels and a total estimate.

### `velocity_stats`

Query aggregate performance statistics.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `group_by` | enum | Yes | `category`, `tag`, `project`, `day`, or `week` |
| `filter_category` | string | No | Filter to a specific category |
| `filter_tag` | string | No | Filter to a specific tag |
| `filter_project` | string | No | Filter to a specific project |
| `last_n_days` | number | No | Time window (default: 30) |

### `velocity_history`

View recent task records with full metadata.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `limit` | number | No | Max records to return (default: 20) |
| `filter_category` | enum | No | Filter by category |
| `filter_status` | enum | No | Filter by status (`completed`, `failed`, `abandoned`) |

## Matching Algorithm

When estimating a new task, the engine finds historical tasks using a weighted similarity score:

1. **Exact category match** (required) -- only tasks in the same category are compared
2. **Tag overlap** -- Jaccard similarity of tag sets (`|A intersection B| / |A union B|`)
3. **File count proximity** -- if `estimated_files` is provided, tasks with similar file counts score higher
4. **Recency boost** -- tasks from the last 7 days get a 1.5x weight multiplier

Tasks with similarity >= 0.3 are included. The duration estimate is the weighted median of matched tasks. When no historical data exists, a heuristic based on category and file count is used.

**Confidence tiers:**

| Level | Criteria |
|---|---|
| `high` | 10+ similar historical tasks |
| `medium` | 3-9 similar tasks |
| `low` | 1-2 similar tasks |
| `none` | No historical data (heuristic fallback) |

## Agent Instructions

If you installed via `npx @whenlabs/when install` or `npx velocity-mcp install`, this is already configured globally. Otherwise, add this to your `CLAUDE.md` or system prompt:

```markdown
## Task Timing

You have access to `velocity-mcp` tools. Follow these rules:

1. Before starting any discrete coding task, call `velocity_start_task` with appropriate category and tags.
2. After completing each task, call `velocity_end_task` with the result status.
3. When creating a multi-step plan, call `velocity_estimate` to provide the user with a time estimate.
4. If the user asks about your speed or performance, call `velocity_stats`.
```

## Project Structure

```
velocity-mcp/
├── src/
│   ├── index.ts              # MCP server entry point (stdio transport)
│   ├── lib.ts                # Library exports for embedding in other MCP servers
│   ├── types.ts              # Shared types, enums, and utility functions
│   ├── cli/
│   │   ├── install.ts        # Global install command
│   │   ├── uninstall.ts      # Global uninstall command
│   │   └── detect-project.ts # Auto project detection from git/cwd
│   ├── db/
│   │   ├── schema.ts         # SQLite schema, migrations, DB initialization
│   │   └── queries.ts        # Prepared statements for all database operations
│   ├── matching/
│   │   └── similarity.ts     # Jaccard similarity, recency weighting, estimation engine
│   ├── tools/
│   │   ├── start-task.ts     # velocity_start_task tool registration
│   │   ├── end-task.ts       # velocity_end_task tool registration
│   │   ├── estimate.ts       # velocity_estimate tool registration
│   │   ├── stats.ts          # velocity_stats tool registration
│   │   └── history.ts        # velocity_history tool registration
│   └── __tests__/
│       ├── similarity.test.ts
│       └── queries.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .gitignore
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Start the server
npm start
```

## Storage

Data is stored in SQLite at `~/.velocity-mcp/velocity.db` (global) or `.velocity/velocity.db` (project-local, if a `.velocity/` directory exists in your project root). The database uses WAL journal mode and contains two tables:

- **`tasks`** -- every recorded task with id, category, tags (JSON), description, project, timestamps, duration, status, file counts, and notes
- **`meta`** -- schema version and first-run date

## License

MIT
