import type {
  DetectedStack,
  AwareConfig,
  Fragment,
  FragmentModule,
} from "../../types.js";
import { matchesStack } from "../common.js";

function buildTailwind3(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.styling, "tailwindcss")) return null;

  return {
    id: "tailwindcss",
    category: "styling",
    title: "Tailwind CSS",
    priority: 20,
    content: `## Tailwind CSS v3

### Configuration
- \`tailwind.config.js\` / \`tailwind.config.ts\` at the project root
- Extend the theme via \`theme.extend\` — don't override the base theme unless intentional
- Configure \`content: [...]\` paths to include every file using Tailwind classes (tree-shaking)
- CSS entry imports \`@tailwind base; @tailwind components; @tailwind utilities;\`
- PostCSS plugin is \`tailwindcss\` + \`autoprefixer\`

### Usage Patterns
- Utility classes directly in markup — avoid custom CSS unless absolutely necessary
- Never use \`@apply\` in component styles — it defeats utility-first CSS
- Compose conditional classes with \`cn()\` or \`clsx()\` + \`tailwind-merge\`
- Group related utilities: layout → spacing → sizing → typography → colors → effects

### Responsive & State
- Mobile-first responsive: \`sm:\`, \`md:\`, \`lg:\`, \`xl:\`, \`2xl:\` (min-width breakpoints)
- State variants: \`hover:\`, \`focus:\`, \`active:\`, \`disabled:\`, \`group-hover:\`, \`peer-checked:\`
- Dark mode: configure strategy (\`class\` or \`media\`) in \`tailwind.config.js\`; use \`dark:\` variant

### Best Practices
- Extract repeated utility patterns into React components, not CSS classes
- Use design tokens from the theme for consistency; avoid arbitrary values like \`w-[137px]\` unless truly one-off
- Use \`prose\` class from \`@tailwindcss/typography\` for rich text/markdown content`,
  };
}

/**
 * Tailwind CSS v3. Keeps the pre-v4 guidance: JS/TS config file,
 * \`@tailwind base/components/utilities\` directives, separate postcss
 * plugins. Applies to any project on v3 or earlier (including unversioned
 * detections, so fresh projects that haven't locked a version yet still
 * get useful guidance).
 */
export const tailwind3Module: FragmentModule = {
  id: "tailwindcss-3",
  category: "styling",
  priority: 20,
  appliesTo: {
    stack: "tailwindcss",
    versionRange: "<4",
  },
  version: "3.x",
  build: buildTailwind3,
};
