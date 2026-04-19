import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function cssModulesFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.styling, "css-modules")) return null;

  return {
    id: "css-modules",
    category: "styling",
    title: "CSS Modules",
    priority: 22,
    content: `## CSS Modules

### Usage
- Import styles as a module object: \`import styles from './Component.module.css'\`
- Apply classes with \`className={styles.container}\` — class names are locally scoped and auto-hashed
- Use camelCase for class names in CSS (\`.myButton\`) so they're accessible as \`styles.myButton\` without bracket notation
- For multiple classes, use template literals or \`clsx\`: \`className={clsx(styles.card, styles.active)}\`

### File Conventions
- Name CSS Module files as \`ComponentName.module.css\` (or \`.module.scss\` for Sass)
- Colocate the module file next to its component: \`Button/Button.tsx\` + \`Button/Button.module.css\`
- One CSS Module per component — don't share module files across unrelated components

### Composition
- Use \`composes: className from './other.module.css'\` to reuse styles across modules
- Use \`composes: className from global\` to compose with a global (non-scoped) class
- For shared variables, use CSS custom properties (variables) on \`:root\` or a shared \`.module.css\`

### Best Practices
- Use \`:global(.className)\` sparingly — only for overriding third-party library styles
- Keep selectors flat and simple — avoid deep nesting; one class per element is the ideal
- Use CSS custom properties for theming and dynamic values instead of inline styles
- TypeScript users: generate type declarations with \`typed-css-modules\` or \`typescript-plugin-css-modules\` for autocompletion`,
  };
}
