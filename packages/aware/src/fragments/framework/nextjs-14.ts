import type {
  DetectedStack,
  AwareConfig,
  Fragment,
  FragmentModule,
} from "../../types.js";
import { matchesStack } from "../common.js";

function buildNextjs14(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  // appliesTo gate handles framework / version / variant — just build.
  if (!matchesStack(stack.framework, "nextjs")) return null;

  return {
    id: "nextjs-app-router",
    category: "framework",
    title: "Next.js (App Router)",
    priority: 10,
    content: `## Next.js 14 — App Router

### Routing & File Conventions
- Use the \`app/\` directory; every route folder needs a \`page.tsx\` to be publicly accessible
- \`layout.tsx\` wraps child routes and persists across navigations — keep layouts lean
- \`loading.tsx\` shows instant loading UI via React Suspense; \`error.tsx\` catches segment errors
- \`not-found.tsx\` handles 404s at any segment level
- Route groups \`(groupName)/\` organize without affecting URL paths

### Server vs Client Components
- All components are **React Server Components** by default
- Add \`'use client'\` at the top of a file **only** when the component needs interactivity, browser APIs, hooks (\`useState\`, \`useEffect\`), or event handlers
- Never import a Server Component into a Client Component — pass it as \`children\` instead

### Data Fetching & Caching (Next 14 defaults)
- Fetch data directly in Server Components using \`async/await\` — no \`useEffect\`
- **\`fetch()\` is cached by default in Next 14** (\`{ cache: 'force-cache' }\` is the default)
- Opt out with \`{ cache: 'no-store' }\` for dynamic requests, or \`{ next: { revalidate: N } }\` for ISR
- Route handlers (\`GET\`) are cached by default unless they read dynamic data (\`cookies()\`, \`headers()\`, etc.)
- \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\` are **synchronous** in Next 14

### Server Actions
- Mark server-only mutation functions with \`'use server'\` directive
- Call them from Client Components via \`action\` prop on forms or programmatically
- Always validate inputs with Zod or similar; never trust client data
- Use \`revalidatePath()\` / \`revalidateTag()\` after mutations to bust cache

### Navigation & Metadata
- Use \`next/navigation\` (\`useRouter\`, \`usePathname\`, \`useSearchParams\`) — never import from \`next/router\`
- Export \`metadata\` object or \`generateMetadata()\` async function from \`page.tsx\`/\`layout.tsx\` for SEO
- Use \`<Link href="...">\` for client-side transitions; it prefetches by default

### Assets & Optimization
- Use \`next/image\` with explicit \`width\`/\`height\` or \`fill\` — never raw \`<img>\`
- Use \`next/font\` to self-host fonts with zero layout shift`,
  };
}

/**
 * Next.js 14 (App Router). Distinct from 15 because the caching defaults
 * are inverted: `fetch()` and route handlers are cached by default in 14,
 * uncached by default in 15 — guidance that tells a user the wrong thing
 * on the wrong version is worse than no guidance.
 */
export const nextjs14Module: FragmentModule = {
  id: "nextjs-14",
  category: "framework",
  priority: 10,
  appliesTo: {
    stack: "nextjs",
    variant: "app-router",
    versionRange: "14",
  },
  version: "14.x",
  build: buildNextjs14,
};
