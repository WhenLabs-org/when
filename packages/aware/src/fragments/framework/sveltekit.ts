import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function sveltekitFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (
    !matchesStack(stack.framework, "sveltekit") &&
    !matchesStack(stack.framework, "svelte")
  )
    return null;

  return {
    id: "sveltekit",
    category: "framework",
    title: "SvelteKit",
    priority: 11,
    content: `## SvelteKit

### File-Based Routing
- Routes live in \`src/routes/\` — each directory can contain \`+page.svelte\`, \`+page.ts\`, and \`+page.server.ts\`
- \`+page.svelte\` is the page component; \`+page.ts\` runs the universal \`load\` function; \`+page.server.ts\` runs server-only \`load\`
- Dynamic route parameters use brackets: \`src/routes/posts/[slug]/+page.svelte\`
- Use \`+layout.svelte\` for shared UI (nav, footer) that wraps child routes via \`<slot/>\`
- Use \`+error.svelte\` to define custom error pages at any route level

### Data Loading
- Export a \`load\` function from \`+page.ts\` (universal) or \`+page.server.ts\` (server-only) to fetch data
- The \`load\` function receives \`{ params, url, fetch }\` — use the provided \`fetch\` for automatic cookie forwarding
- Returned data is available in the page component via the \`data\` prop: \`export let data\`
- Use \`depends()\` and \`invalidate()\` for fine-grained data revalidation

### Form Actions
- Define form actions in \`+page.server.ts\` with the \`actions\` export for handling form submissions
- Use \`<form method="POST">\` — SvelteKit progressively enhances with \`use:enhance\`
- Named actions: \`<form method="POST" action="?/delete">\` maps to \`actions: { delete: async () => {} }\`
- Return validation errors with \`fail(400, { errors })\` — access in the page via \`form\` prop

### Stores & Navigation
- Use \`$app/navigation\` for programmatic navigation: \`goto()\`, \`invalidateAll()\`, \`beforeNavigate()\`
- Use \`$app/stores\` for \`page\` (current URL, params), \`navigating\`, and \`updated\` stores
- Svelte stores (\`writable\`, \`readable\`, \`derived\`) provide reactive state management
- Prefix store references with \`$\` in Svelte files for auto-subscription

### Best Practices
- Prefer \`+page.server.ts\` for data loading that involves secrets or direct database access
- Use \`+layout.ts\` / \`+layout.server.ts\` to share data across all child routes
- Use \`throw error(404)\` from load functions for expected errors (not found, unauthorized)
- Use hooks in \`src/hooks.server.ts\` for auth checks, logging, and request-level middleware`,
  };
}
