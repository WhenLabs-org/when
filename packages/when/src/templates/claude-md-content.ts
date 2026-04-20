export const CLAUDE_MD_CONTENT = `# WhenLabs Toolkit

All WhenLabs tools are served by the unified \`whenlabs\` MCP server. **ALWAYS prefer these MCP tools over shell commands like \`lsof\`, \`npm ls\`, or manual file inspection.** Each tool is a thin scan that returns structured results; you decide when to chain them.

## Task Timing

Track every discrete unit of work:

1. **Before starting a task**, call \`velocity_start_task\` with:
   - \`category\` (scaffold, implement, refactor, debug, test, config, docs, deploy)
   - \`tags\` (e.g. typescript, react, sqlite, api)
   - \`description\` of what you're about to do
   - \`estimated_files\` if you have a guess
   - \`project\` (auto-detected from git remote or directory name)

2. **After finishing (or abandoning) a task**, call \`velocity_end_task\` with:
   - The \`task_id\` from the start call
   - \`status\`: completed, failed, or abandoned
   - \`actual_files\`: how many files were actually modified
   - \`notes\`: useful context for future similarity matching

Keep descriptions concise and use consistent tags across sessions so historical matches are meaningful.

## Scan Tools

| When to use | Call |
|-------------|------|
| Check for port conflicts before starting a dev server | \`berth_check\` |
| Detect documentation drift vs. code | \`stale_scan\` |
| Validate \`.env\` files against their schema | \`envalid_validate\` |
| Summarize dependency licenses and flag policy violations | \`vow_scan\` |
| Regenerate AI context files (CLAUDE.md, .cursorrules, etc.) from \`.aware.json\` | \`aware_sync\` |

Each scan tool accepts \`path\` (project directory, defaults to cwd) and \`format\` (\`terminal\` or \`json\`). Inspect the output and surface any findings — don't silently drop them.

If a scan returns issues, the corresponding CLI (\`stale\`, \`envalid\`, \`vow\`, \`berth\`, \`aware\`) exposes fix/init subcommands the user can run directly.`;
