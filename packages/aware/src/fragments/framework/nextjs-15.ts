import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function nextjs15Fragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "nextjs")) return null;

  const version = stack.framework!.version;
  const major = version ? parseInt(version.split(".")[0] ?? "", 10) : null;
  if (major !== null && major < 14) return null;

  const variant = stack.framework!.variant;
  if (variant === "pages-router") return null;

  return {
    id: "nextjs-app-router",
    category: "framework",
    title: "Next.js (App Router)",
    priority: 10,
    content: `## Next.js — App Router

### Routing & File Conventions
- Use the \`app/\` directory; every route folder needs a \`page.tsx\` to be publicly accessible
- \`layout.tsx\` wraps child routes and persists across navigations — keep layouts lean
- \`loading.tsx\` shows instant loading UI via React Suspense; \`error.tsx\` catches segment errors
- \`not-found.tsx\` handles 404s at any segment level
- Route groups \`(groupName)/\` organize without affecting URL paths
- Parallel routes (\`@slot\`) and intercepting routes \`(..)\` for modals and complex layouts

### Server vs Client Components
- All components are **React Server Components** by default — they run only on the server
- Add \`'use client'\` at the top of a file **only** when the component needs interactivity, browser APIs, hooks (\`useState\`, \`useEffect\`), or event handlers
- Never import a Server Component into a Client Component — pass it as \`children\` instead
- Keep Client Components at the leaf of the component tree to minimize client JS bundle

### Data Fetching
- Fetch data directly in Server Components using \`async/await\` — no \`useEffect\`
- Use \`fetch()\` with Next.js extended options: \`{ cache: 'force-cache' }\` (default, static), \`{ cache: 'no-store' }\` (dynamic), or \`{ next: { revalidate: N } }\` for ISR
- Deduplicate requests automatically — same URL + options fetched multiple times in a render tree is called once

### Server Actions
- Mark server-only mutation functions with \`'use server'\` directive
- Call them from Client Components via \`action\` prop on forms or programmatically
- Always validate inputs with Zod or similar; never trust client data
- Use \`revalidatePath()\` / \`revalidateTag()\` after mutations to bust cache

### API Routes
- Place route handlers in \`app/api/*/route.ts\` exporting named functions: \`GET\`, \`POST\`, \`PUT\`, \`DELETE\`, \`PATCH\`
- Return \`NextResponse.json()\` — set appropriate status codes
- For webhooks or external APIs only; prefer Server Actions for internal mutations

### Navigation & Metadata
- Use \`next/navigation\` (\`useRouter\`, \`usePathname\`, \`useSearchParams\`) — never import from \`next/router\`
- Export \`metadata\` object or \`generateMetadata()\` async function from \`page.tsx\`/\`layout.tsx\` for SEO
- Use \`<Link href="...">\` for client-side transitions; it prefetches by default

### Assets & Optimization
- Use \`next/image\` with explicit \`width\`/\`height\` or \`fill\` — never raw \`<img>\`
- Use \`next/font\` to self-host fonts with zero layout shift
- Use \`next/link\` for all internal navigation`,
  };
}
