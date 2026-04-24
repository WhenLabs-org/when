/**
 * Markdown body written to ~/.claude/skills/whenlabs/SKILL.md by `when install`.
 * Claude Code auto-discovers skills in that directory at session start, so
 * editing this string is an agent-behavior change — review carefully.
 */
export const SKILL_MD_CONTENT = `---
name: whenlabs
description: track task velocity and surface scan state (stale docs, port conflicts, env drift, license risk) to the agent
trigger: /whenlabs
---

# /whenlabs

The WhenLabs toolkit ships a unified MCP server with eight tools. This skill
tells you when to call them, how to read their results, and — importantly —
when to stay quiet.

## When to call \`velocity_start_task\`

Before any discrete unit of coding work: a bug fix, a feature, a refactor,
a test-writing pass. Pair with \`velocity_end_task\` so the dataset stays
clean. Don't batch unrelated changes under one task.

Skip for: pure conversation, a one-line typo fix, a trivial read.

## Interpreting \`recent_similar\`

The response may include up to 5 past comparable tasks with outcomes:

- **If ≥2 similar tasks had \`tests_passed_first_try: false\`** — run tests
  before claiming done. Past-you learned the hard way.
- **If a \`notes\` field mentions a recurring gotcha** (migration step,
  snapshot rebuild, missing env var) — surface it to the user before
  starting, not after reproducing the same mistake.
- **If the closest match took 3× longer than your estimate** — budget
  accordingly; either scope down or warn the user up front.

Don't mention \`recent_similar\` to the user unless the data changes your
approach. Noise is worse than silence.

## When to call \`whenlabs_summary\`

Once at session start, or when the user asks "what's the state of the
project." The tool returns counts for stale docs, port conflicts, env
drift, license risk, and AI-context freshness in a single JSON rollup.

If \`worst_severity\` is \`error\`, surface the offending tools and their
details. If it's \`warning\` or \`clean\`, stay quiet unless asked.

Don't call it on every prompt — that's what the UserPromptSubmit hook
(optional, installed via \`when install --hooks\`) is for. Calling it
explicitly on every turn is wasteful.

## When NOT to call any of these tools

- Single-line edits (typos, variable renames)
- Pure conversation or explanation
- Questions about the tools themselves — answer from the skill, don't
  invoke them just to demonstrate
- Inside a tight loop (e.g. running \`velocity_start_task\` once per file
  edited — that's what one task across the whole feature is for)

## Pairs that must always go together

- \`velocity_start_task\` → \`velocity_end_task\` (always, even on failure
  or abandonment — status="failed" or "abandoned" is valid data)

## Exit behavior

\`when doctor --brief\` always exits 0, even when issues exist. That's
intentional so it's safe to wire into a UserPromptSubmit hook. Don't
interpret a zero exit from \`--brief\` as "clean" — parse the stdout.
`;
