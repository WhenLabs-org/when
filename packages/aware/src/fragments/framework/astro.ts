import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function astroFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "astro")) return null;

  return {
    id: "astro",
    category: "framework",
    title: "Astro",
    priority: 12,
    content: `## Astro

### Component Syntax
- \`.astro\` files have two parts: frontmatter (fenced by \`---\`) for server-side JS/TS, and an HTML template below
- Access component props via \`Astro.props\` — define a \`Props\` interface in the frontmatter for type safety
- Expressions in the template use \`{}\` syntax — all code in the frontmatter runs at build time (or request time in SSR)
- Astro components render to HTML with zero client-side JS by default

### Islands Architecture
- Components are static by default — add a \`client:*\` directive to make them interactive
- Use \`client:load\` for components that must be interactive immediately on page load
- Use \`client:visible\` for components that should hydrate only when scrolled into view (lazy hydration)
- Use \`client:idle\` for lower-priority interactive components that hydrate when the browser is idle
- You can use React, Vue, Svelte, or other framework components as islands in the same project

### Content Collections
- Define content collections in \`src/content/\` with a schema in \`src/content/config.ts\`
- Use \`getCollection()\` and \`getEntry()\` to query content with full type safety
- Content supports Markdown and MDX out of the box — use frontmatter for metadata
- Validate frontmatter with Zod schemas in the collection config

### Routing & Pages
- File-based routing in \`src/pages/\` — \`.astro\`, \`.md\`, and \`.mdx\` files become pages automatically
- Use \`getStaticPaths()\` in dynamic route files (\`[slug].astro\`) to generate pages at build time
- Use \`Astro.redirect()\` for server-side redirects in SSR mode
- API routes use \`.ts\` files in \`src/pages/\` that export HTTP method handlers

### Best Practices
- Prefer static rendering — only opt into SSR (\`output: 'server'\`) when you need request-time data
- Use Astro's built-in \`<Image>\` component for automatic image optimization
- Minimize client-side JS — only add \`client:*\` directives where interactivity is truly needed
- Use \`define:vars\` to pass frontmatter variables into \`<style>\` and \`<script>\` tags`,
  };
}
