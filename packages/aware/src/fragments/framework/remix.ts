import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function remixFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "remix")) return null;

  return {
    id: "remix",
    category: "framework",
    title: "Remix",
    priority: 11,
    content: `## Remix

### Data Loading & Mutations
- Use \`loader\` functions for server-side data fetching — they run only on the server before rendering
- Use \`action\` functions for form submissions and mutations — they handle POST/PUT/DELETE requests
- Access loader data in components with the \`useLoaderData()\` hook — it is fully typed when using TypeScript
- Access action results with \`useActionData()\` — use it to return validation errors or success messages
- Use \`defer()\` with \`<Await>\` to stream slower data while rendering the shell immediately

### Routing & Navigation
- Routes are file-based in \`app/routes/\` — nested routes render inside the parent's \`<Outlet/>\` component
- Use dot-delimited filenames for nested URLs: \`routes/dashboard.settings.tsx\` maps to \`/dashboard/settings\`
- Use \`<Link to="...">\` for client-side navigation; use \`<NavLink>\` for active-state styling
- Dynamic segments use \`$param\` in filenames: \`routes/users.$userId.tsx\`

### Forms & Submissions
- Use Remix's \`<Form>\` component instead of plain HTML forms — it enables progressive enhancement
- \`<Form method="post">\` submits to the route's \`action\`; use \`formData.get()\` to read values
- Use \`useNavigation()\` to show pending UI during form submissions (\`navigation.state === 'submitting'\`)
- Use \`useFetcher()\` for non-navigation mutations (inline updates, background saves)

### Error Handling & SEO
- Export an \`ErrorBoundary\` component from any route to catch errors in that route segment
- Use \`isRouteErrorResponse(error)\` to distinguish expected (4xx) from unexpected errors
- Export a \`meta\` function to set page title, description, and Open Graph tags per route
- Export a \`links\` function to add route-specific CSS, preloads, or favicons

### Best Practices
- Keep loaders and actions in the route file — colocate data logic with the UI that uses it
- Return \`json()\` from loaders/actions with proper HTTP status codes
- Use \`redirect()\` in actions after successful mutations to prevent form resubmission
- Validate all form data on the server in the \`action\` — never trust client-side validation alone`,
  };
}
