import type {
  DetectedStack,
  AwareConfig,
  Fragment,
  FragmentModule,
} from "../../types.js";
import { matchesStack } from "../common.js";

function buildTailwind4(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.styling, "tailwindcss")) return null;

  return {
    id: "tailwindcss",
    category: "styling",
    title: "Tailwind CSS",
    priority: 20,
    content: `## Tailwind CSS v4

### Configuration (CSS-native)
- **No \`tailwind.config.js\`** — configuration lives in CSS via the \`@theme\` directive
- Import with \`@import "tailwindcss";\` in your main CSS file; no \`@tailwind base/components/utilities\` anymore
- Define custom tokens inline:
  \`\`\`css
  @theme {
    --color-brand: #3b82f6;
    --font-display: "Inter", sans-serif;
  }
  \`\`\`
  Then use as \`bg-brand\`, \`font-display\` — utility names are derived from the token name.
- Use \`@variant\` to define custom variants, \`@utility\` for custom utilities
- PostCSS plugin is \`@tailwindcss/postcss\` (not \`tailwindcss\` directly) in v4

### Usage Patterns
- Utility classes directly in markup — avoid custom CSS unless absolutely necessary
- Never use \`@apply\` in component styles — it defeats utility-first CSS and bloats output
- Compose conditional classes with \`cn()\` or \`clsx()\` + \`tailwind-merge\`
- Container queries are first-class: \`@container\`, \`@sm:\`, \`@md:\` etc. on the container element

### Responsive & State
- Mobile-first responsive: \`sm:\`, \`md:\`, \`lg:\`, \`xl:\`, \`2xl:\` (min-width breakpoints)
- State variants: \`hover:\`, \`focus:\`, \`active:\`, \`disabled:\`, \`group-hover:\`, \`peer-checked:\`
- Dark mode: \`dark:\` variant; v4 uses the \`prefers-color-scheme\` media query by default

### Best Practices
- Extract repeated utility patterns into components, not CSS classes
- Use theme tokens instead of arbitrary values like \`w-[137px]\` unless truly one-off
- v4's JIT engine handles arbitrary-value utilities at parse time — no perf concern`,
  };
}

/**
 * Tailwind CSS v4+. The big change from v3: configuration is CSS-native
 * (no \`tailwind.config.js\`), import directive is different, and the
 * PostCSS plugin moved to \`@tailwindcss/postcss\`. Writing v3 guidance on
 * a v4 project tells people to edit files that don't exist.
 */
export const tailwind4Module: FragmentModule = {
  id: "tailwindcss-4",
  category: "styling",
  priority: 20,
  appliesTo: {
    stack: "tailwindcss",
    versionRange: ">=4",
    // Default to v4 guidance when version can't be determined —
    // new Tailwind projects are on v4, and v4 is the current major.
    matchUnknown: true,
  },
  version: "4.x",
  build: buildTailwind4,
};
