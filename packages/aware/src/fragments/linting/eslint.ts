import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesAny } from "../common.js";

export function eslintFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesAny(stack.linting, "eslint")) return null;

  const eslintItem = stack.linting.find(
    (l) => l.name.toLowerCase() === "eslint",
  );
  const version = eslintItem?.version;
  const major = version ? parseInt(version.split(".")[0] ?? "", 10) : null;
  const isV9 = major !== null && major >= 9;

  const configSection = isV9
    ? `### ESLint v9 — Flat Config
- Configuration in \`eslint.config.js\` (or \`.mjs\`/\`.ts\`) — no more \`.eslintrc\` files
- Export an array of config objects; later entries override earlier ones
- Use \`languageOptions.globals\` instead of \`env\`; use \`languageOptions.parser\` instead of top-level \`parser\`
- Ignore files with \`ignores\` key in a config object (replaces \`.eslintignore\`)`
    : `### ESLint v8 — Legacy Config
- Configuration in \`.eslintrc.json\`, \`.eslintrc.js\`, or \`.eslintrc.yml\`
- Use \`extends\` for shared configs; \`overrides\` for file-specific rules
- Ignore files with \`.eslintignore\` or the \`ignorePatterns\` config field`;

  return {
    id: "eslint",
    category: "linting",
    title: "ESLint",
    priority: 70,
    content: `## ESLint

${configSection}

### Usage
- Run \`eslint --fix\` to auto-fix safe issues (formatting, import order, unused imports)
- Integrate with editor for real-time feedback — fix-on-save is recommended
- Run in CI to block merges with lint errors

### Rules & Discipline
- Never disable a rule without a justifying comment: \`// eslint-disable-next-line rule-name -- reason\`
- Prefer configuring rules in the config file over scattering inline disables
- Use \`error\` for rules that indicate bugs; \`warn\` for stylistic issues being adopted incrementally
- Don't disable \`no-explicit-any\` — fix the type instead; use \`unknown\` and narrow

### Best Practices
- Use \`typescript-eslint\` for TypeScript projects — it provides type-aware rules
- Combine with Prettier (or disable formatting rules) to avoid conflicts
- Keep custom rules minimal — prefer well-maintained shared configs (\`eslint-config-next\`, \`@typescript-eslint/recommended\`)`,
  };
}
