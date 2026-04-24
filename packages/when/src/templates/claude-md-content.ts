export const CLAUDE_MD_CONTENT = `# WhenLabs Toolkit

All WhenLabs tools are served by the unified \`whenlabs\` MCP server. **Prefer these MCP tools over shell commands like \`lsof\`, \`npm ls\`, or manual file inspection.**

Detailed behavior rules — when to start/end velocity tasks, how to interpret \`recent_similar\`, when to call \`whenlabs_summary\` vs. the individual scanners — live in the skill file at \`~/.claude/skills/whenlabs/SKILL.md\`. Claude Code auto-discovers it at session start; agents without skill support should read it directly.

## Tools at a glance

| When to use | Call |
|-------------|------|
| Unified rollup of every scanner (use at session start) | \`whenlabs_summary\` |
| Check for port conflicts before starting a dev server | \`berth_check\` |
| Detect documentation drift vs. code | \`stale_scan\` |
| Validate \`.env\` files against their schema | \`envalid_validate\` |
| Summarize dependency licenses and flag policy violations | \`vow_scan\` |
| Regenerate AI context files from \`.aware.json\` | \`aware_sync\` |
| Time a discrete coding task — always pair start → end | \`velocity_start_task\` / \`velocity_end_task\` |

Each scan tool accepts \`path\` (defaults to cwd) and \`format\` (\`terminal\` or \`json\`). Surface findings to the user — don't silently drop them.`;
