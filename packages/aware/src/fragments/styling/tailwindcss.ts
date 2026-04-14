import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function tailwindcssFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.styling, "tailwindcss")) return null;

  const version = stack.styling!.version;
  const major = version ? parseInt(version.split(".")[0] ?? "", 10) : null;
  const isV4 = major !== null && major >= 4;

  const versionSection = isV4
    ? `### Tailwind CSS v4
- Configuration uses CSS-native \`@theme\` directive in your CSS file — no \`tailwind.config.js\` needed
- Define custom values with \`@theme { --color-brand: #3b82f6; }\` and use as \`bg-brand\`
- Use \`@variant\` for custom variants; \`@utility\` for custom utilities
- Import Tailwind with \`@import "tailwindcss";\` in your main CSS file`
    : `### Tailwind CSS v3
- Configuration in \`tailwind.config.js\` / \`tailwind.config.ts\`
- Extend the theme in \`theme.extend\` — don't override the base theme unless intentional
- Configure \`content\` paths to include all files with Tailwind classes for tree-shaking`;

  return {
    id: "tailwindcss",
    category: "styling",
    title: "Tailwind CSS",
    priority: 20,
    content: `## Tailwind CSS

${versionSection}

### Usage Patterns
- Use utility classes directly in markup — avoid writing custom CSS unless absolutely necessary
- Never use \`@apply\` in component styles — it defeats the purpose of utility-first CSS and increases bundle size
- Compose complex styles with \`cn()\` or \`clsx()\` utility for conditional class merging (install \`tailwind-merge\` + \`clsx\`)
- Group related utilities with consistent ordering: layout → spacing → sizing → typography → colors → effects

### Responsive & State
- Mobile-first responsive: \`sm:\`, \`md:\`, \`lg:\`, \`xl:\`, \`2xl:\` prefixes (min-width breakpoints)
- State variants: \`hover:\`, \`focus:\`, \`active:\`, \`disabled:\`, \`group-hover:\`, \`peer-checked:\`
- Dark mode: use \`dark:\` variant; configure strategy (\`class\` or \`media\`) as needed

### Best Practices
- Extract repeated utility patterns into React components, not CSS classes
- Use design tokens from the theme for consistency — avoid arbitrary values like \`w-[137px]\` unless truly one-off
- Use \`prose\` class from \`@tailwindcss/typography\` for rich text/markdown content`,
  };
}
