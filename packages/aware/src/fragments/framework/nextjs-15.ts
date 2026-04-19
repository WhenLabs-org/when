import type {
  DetectedStack,
  AwareConfig,
  Fragment,
  FragmentModule,
} from "../../types.js";
import { matchesStack } from "../common.js";

function buildNextjs15(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  // The registry's appliesTo gate handles framework=nextjs, version>=15,
  // and variant=app-router. This function only builds the content.
  if (!matchesStack(stack.framework, "nextjs")) return null;

  return {
    id: "nextjs-app-router",
    category: "framework",
    title: "Next.js (App Router)",
    priority: 10,
    content: `## Next.js 15 — App Router

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

### Data Fetching & Caching (Next 15 defaults)
- Fetch data directly in Server Components using \`async/await\` — no \`useEffect\`
- **\`fetch()\` is no longer cached by default in Next 15** — opt in explicitly with \`{ cache: 'force-cache' }\` or \`{ next: { revalidate: N } }\`
- Route handlers (\`GET\`) are no longer cached by default either — mark with \`export const dynamic = 'force-static'\` if you want static caching
- \`cookies()\`, \`headers()\`, \`draftMode()\`, \`params\`, \`searchParams\` are **async** in Next 15 — \`await\` them

### Server Actions
- Mark server-only mutation functions with \`'use server'\` directive
- Call them from Client Components via \`action\` prop on forms or programmatically
- Always validate inputs with Zod or similar; never trust client data
- Use \`revalidatePath()\` / \`revalidateTag()\` after mutations to bust cache

### Navigation & Metadata
- Use \`next/navigation\` (\`useRouter\`, \`usePathname\`, \`useSearchParams\`) — never import from \`next/router\`
- Export \`metadata\` object or \`generateMetadata()\` async function from \`page.tsx\`/\`layout.tsx\` for SEO
- Use \`<Link href="...">\` for client-side transitions; it prefetches by default (\`prefetch={false}\` to opt out)

### Assets & Optimization
- Use \`next/image\` with explicit \`width\`/\`height\` or \`fill\` — never raw \`<img>\`
- Use \`next/font\` to self-host fonts with zero layout shift
- Turbopack is stable for \`next dev\` in 15; use \`--turbo\` to opt in`,
  };
}

/**
 * Next.js 15+ (App Router). The key guidance change from 14: `fetch()` and
 * route handlers are no longer cached by default, and request APIs
 * (`cookies`, `headers`, `params`) are async.
 */
export const nextjs15Module: FragmentModule = {
  id: "nextjs-15",
  category: "framework",
  priority: 10,
  appliesTo: {
    stack: "nextjs",
    variant: "app-router",
    versionRange: ">=15",
    // Act as the default when the installed version can't be determined
    // (no lockfile, range like "latest"). Better to hand Next users the
    // latest guidance than no guidance.
    matchUnknown: true,
  },
  version: "15.x",
  build: buildNextjs15,
};

// Legacy named export kept so existing imports (if any) still work until
// fragments/index.ts is fully migrated.
export const nextjs15Fragment = buildNextjs15;
