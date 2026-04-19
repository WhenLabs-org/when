import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function vercelFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.deployment, "vercel")) return null;

  return {
    id: "vercel",
    category: "deployment",
    title: "Vercel",
    priority: 80,
    content: `## Vercel Deployment

### Configuration
- Use \`vercel.json\` for redirects, rewrites, headers, and function configuration
- Set environment variables in the Vercel dashboard (Settings > Environment Variables) — never hardcode secrets
- Use different env var values per environment: Production, Preview, and Development

### Build & Runtime
- Vercel auto-detects the framework and runs the appropriate build command
- Override build settings in Project Settings or \`vercel.json\` if auto-detection is wrong
- Use Edge Runtime (\`export const runtime = 'edge'\`) for latency-sensitive API routes and middleware
- Serverless Functions have a default 10s timeout (60s on Pro) — keep functions fast

### Caching & ISR
- Use ISR (\`revalidate: N\`) on static pages to rebuild in the background at fixed intervals
- Use on-demand revalidation (\`revalidatePath()\`, \`revalidateTag()\`) triggered by webhooks for instant updates
- Static assets are cached on Vercel's CDN automatically — use cache headers for API responses

### Best Practices
- Test locally with \`vercel dev\` to match production behavior (environment, routing)
- Use Preview Deployments (automatic on PRs) for team review before merging
- Monitor function performance in Vercel Analytics — watch for cold starts and timeouts
- Use \`vercel env pull\` to sync environment variables to \`.env.local\` for local development`,
  };
}
