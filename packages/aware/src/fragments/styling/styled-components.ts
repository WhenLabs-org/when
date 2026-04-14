import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function styledComponentsFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.styling, "styled-components")) return null;

  return {
    id: "styled-components",
    category: "styling",
    title: "styled-components",
    priority: 21,
    content: `## styled-components

### Component Creation
- Create styled components with \`styled.div\` (or any HTML element) using tagged template literals
- Extend existing styled components with \`styled(ExistingComponent)\` for variants
- Use the \`css\` helper for reusable style fragments: \`const truncate = css\\\`white-space: nowrap; overflow: hidden;\\\`\`
- Name styled components with a meaningful prefix — \`Wrapper\`, \`Container\`, \`StyledButton\` — for DevTools clarity

### Theming
- Wrap the app root with \`<ThemeProvider theme={theme}>\` to make the theme available everywhere
- Access theme values in styled components via \`\${({ theme }) => theme.colors.primary}\`
- Define the theme object with TypeScript interface for autocompletion and type safety
- Keep theme tokens consistent: colors, spacing, typography, breakpoints, shadows

### Dynamic Styling
- Pass props to styled components for conditional styles: \`\${({ $variant }) => $variant === 'primary' && css\\\`...\\\`}\`
- Use transient props (prefixed with \`$\`) to prevent styled-component props from reaching the DOM
- Use \`attrs()\` to set default HTML attributes or computed props

### Best Practices
- Colocate styled components in the same file as the React component, or in a \`.styles.ts\` file alongside it
- Avoid deeply nested selectors — prefer flat styled components for each element
- Use \`createGlobalStyle\` for resets and global CSS — don't scatter global styles
- Enable the Babel plugin or SWC plugin for readable class names in development and SSR support`,
  };
}
