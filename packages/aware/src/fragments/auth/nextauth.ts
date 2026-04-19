import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function nextauthFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.auth, "nextauth")) return null;

  const authItem = stack.auth!;
  const version = authItem.version;
  const major = version ? parseInt(version.split(".")[0] ?? "", 10) : null;
  const isV5 = major !== null && major >= 5;

  const versionContent = isV5
    ? `### NextAuth.js v5 (Auth.js)
- Configure in \`auth.ts\` at project root — exports \`auth\`, \`signIn\`, \`signOut\`, \`handlers\`
- Use \`auth()\` in Server Components and Server Actions to get the session — no provider wrapper needed
- Middleware-based sessions: export \`{ auth as middleware }\` from \`auth.ts\` in \`middleware.ts\`
- Route handler: \`export const { GET, POST } = handlers\` in \`app/api/auth/[...nextauth]/route.ts\`
- Use \`auth()\` guard in API routes and Server Actions; redirect unauthenticated users with \`redirect()\``
    : `### NextAuth.js v4
- Configure in \`pages/api/auth/[...nextauth].ts\` (Pages Router) or \`app/api/auth/[...nextauth]/route.ts\` (App Router)
- Wrap app with \`<SessionProvider>\` for client-side session access
- Use \`useSession()\` hook in Client Components for session data and status
- Use \`getServerSession(authOptions)\` in \`getServerSideProps\` or API routes for server-side session checks
- Protect pages with \`getServerSideProps\` redirect logic or middleware`;

  return {
    id: "nextauth",
    category: "auth",
    title: "NextAuth.js",
    priority: 50,
    content: `## NextAuth.js

${versionContent}

### Providers & Callbacks
- Configure OAuth providers (Google, GitHub, etc.) and/or Credentials provider in the auth config
- Use \`callbacks.jwt\` to enrich the JWT token with custom claims (role, userId)
- Use \`callbacks.session\` to expose token data to the client session object
- Always validate and sanitize data in callbacks — never trust external provider data blindly

### Session & Security
- Use JWT strategy for serverless deployments; database strategy when you need server-side session revocation
- Set \`NEXTAUTH_SECRET\` environment variable — required for token encryption
- Protect API routes by checking session at the start of every handler; return 401 if unauthenticated
- Use CSRF protection (built-in) — never disable it`,
  };
}
