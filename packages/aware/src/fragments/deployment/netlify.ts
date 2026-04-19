import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function netlifyFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.deployment, "netlify")) return null;

  return {
    id: "netlify",
    category: "deployment",
    title: "Netlify",
    priority: 81,
    content: `## Netlify Deployment

### Configuration
- Configure builds and deploy settings in \`netlify.toml\` at project root
- Set \`[build]\` section: \`command\`, \`publish\` (output directory), and \`base\` (for monorepos)
- Use \`[[redirects]]\` for URL redirects and rewrites; \`[[headers]]\` for custom response headers
- Set environment variables in Netlify dashboard (Site Settings > Environment Variables) — not in \`netlify.toml\`

### Netlify Functions
- Place serverless functions in \`netlify/functions/\` directory (configurable in \`netlify.toml\`)
- Each file or directory exports a \`handler\` function: \`export const handler = async (event, context) => { ... }\`
- Functions are deployed as AWS Lambda — 10s default timeout (26s for background functions)
- Use \`@netlify/functions\` package for TypeScript types and advanced features (scheduled functions, streams)

### Redirects & Routing
- SPA routing: add \`/* /index.html 200\` to \`_redirects\` file or \`netlify.toml\` for client-side routing
- Proxy API calls: \`/api/* https://your-api.com/:splat 200\` to avoid CORS issues
- Redirect rules are processed in order — place more specific rules first

### Best Practices
- Use Deploy Previews (automatic on PRs) for team review before merging to production
- Use \`netlify dev\` for local development that matches production behavior
- Use Netlify Edge Functions (\`netlify/edge-functions/\`) for latency-sensitive transformations running on Deno at the edge
- Use branch-based deploys for staging environments`,
  };
}
