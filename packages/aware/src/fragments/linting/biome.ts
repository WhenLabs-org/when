import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesAny } from "../common.js";

export function biomeFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesAny(stack.linting, "biome")) return null;

  return {
    id: "biome",
    category: "linting",
    title: "Biome",
    priority: 70,
    content: `## Biome

### Overview
- Biome is a single tool for **both linting and formatting** — no need for separate ESLint + Prettier setup
- Extremely fast (written in Rust) — runs linting and formatting in milliseconds

### Configuration
- Configure in \`biome.json\` or \`biome.jsonc\` at project root
- Enable/disable specific rule groups under \`linter.rules\`: \`recommended\`, \`correctness\`, \`style\`, \`suspicious\`, \`complexity\`
- Configure formatter under \`formatter\`: \`indentStyle\`, \`indentWidth\`, \`lineWidth\`, \`quoteStyle\`

### Usage
- Run \`biome check .\` to lint and format-check all files; add \`--apply\` to auto-fix: \`biome check --apply .\`
- Run \`biome format --write .\` to format only; \`biome lint .\` to lint only
- Use \`biome ci .\` in CI pipelines — it exits with non-zero on any issue

### Best Practices
- Enable format-on-save in your editor with Biome as the formatter
- Use \`biome.json\` \`overrides\` for file-specific rule configuration
- Don't disable rules without justification — add inline comments: \`// biome-ignore lint/rule: reason\`
- When migrating from ESLint + Prettier, use \`biome migrate eslint\` and \`biome migrate prettier\` to convert configs`,
  };
}
