import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function nextjsPagesFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "nextjs")) return null;

  const variant = stack.framework!.variant;
  const version = stack.framework!.version;
  const major = version ? parseInt(version.split(".")[0] ?? "", 10) : null;

  // Only match pages router variant or older versions (12, 13)
  const isOlderVersion = major !== null && major <= 13;
  if (variant !== "pages-router" && !isOlderVersion) return null;

  return {
    id: "nextjs-pages-router",
    category: "framework",
    title: "Next.js (Pages Router)",
    priority: 10,
    content: `## Next.js — Pages Router

### Routing & File Conventions
- Routes are defined by files in the \`pages/\` directory — \`pages/about.tsx\` maps to \`/about\`
- Dynamic routes use bracket syntax: \`pages/posts/[id].tsx\`, catch-all: \`[...slug].tsx\`
- \`_app.tsx\` wraps all pages — use for global providers, layouts, and persistent state
- \`_document.tsx\` customizes the HTML shell (runs server-side only)
- API routes live in \`pages/api/\` — each file exports a default handler function

### Data Fetching
- \`getServerSideProps\` — runs on every request; use for user-specific or frequently changing data
- \`getStaticProps\` — runs at build time; use for content that changes infrequently
- \`getStaticPaths\` — required with \`getStaticProps\` for dynamic routes; defines which paths to pre-render
- Always return \`{ props: {} }\` from data fetching functions; use \`{ notFound: true }\` or \`{ redirect: {} }\` when needed
- Avoid \`useEffect\` for data fetching — prefer server-side methods

### Navigation
- Use \`next/router\` (\`useRouter\`) for programmatic navigation — \`router.push()\`, \`router.replace()\`
- Use \`next/link\` with \`<Link href="...">\` for client-side transitions
- Access route params via \`router.query\`

### API Routes
- \`pages/api/*.ts\` files export \`(req: NextApiRequest, res: NextApiResponse) => void\`
- Use \`req.method\` to handle different HTTP methods in a single handler
- Validate request bodies; return proper status codes with \`res.status(N).json()\`

### Optimization
- Use \`next/image\` with explicit dimensions — never raw \`<img>\` tags
- Use \`next/head\` for per-page metadata (\`<title>\`, \`<meta>\`)
- Use dynamic imports (\`next/dynamic\`) for code-splitting heavy components`,
  };
}
