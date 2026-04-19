import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesAny } from "../common.js";

export function prettierFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesAny(stack.linting, "prettier")) return null;

  return {
    id: "prettier",
    category: "linting",
    title: "Prettier",
    priority: 72,
    content: `## Prettier

### Role
- Prettier handles **all code formatting** — do not manually format or argue about style
- It is opinionated by design — respect the project's Prettier config without overriding it inline

### Configuration
- Config in \`.prettierrc\`, \`.prettierrc.json\`, \`prettier.config.js\`, or the \`prettier\` field in \`package.json\`
- Ignore files with \`.prettierignore\` — typically ignore generated files, build output, and lock files
- Key options to be aware of: \`semi\`, \`singleQuote\`, \`trailingComma\`, \`tabWidth\`, \`printWidth\`

### Usage
- Run \`prettier --write .\` to format all files; \`prettier --check .\` in CI to verify formatting
- Enable format-on-save in your editor with Prettier as the default formatter
- Run after code generation (OpenAPI, Prisma) to normalize output formatting

### Integration with Linters
- Use \`eslint-config-prettier\` to disable ESLint rules that conflict with Prettier
- Never use \`eslint-plugin-prettier\` (runs Prettier as an ESLint rule) — it's slow; run them separately
- Prettier formats; ESLint catches bugs — keep their responsibilities separate`,
  };
}
