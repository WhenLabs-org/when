import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function betterAuthFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.auth, "better-auth")) return null;

  return {
    id: "better-auth",
    category: "auth",
    title: "Better Auth",
    priority: 52,
    content: `## Better Auth

### Setup
- Configure Better Auth in \`src/lib/auth.ts\` with \`betterAuth()\`
- Define database adapter, email provider, and social providers in the config
- Create the auth client with \`createAuthClient()\` for frontend usage

### Usage
- Use \`auth.api\` for server-side operations (sign up, sign in, session management)
- Use the auth client hooks (\`useSession\`, \`signIn\`, \`signOut\`) in React components
- Protect API routes by calling \`auth.api.getSession()\` and checking the result
- Use plugins for additional features (two-factor, magic link, organization support)

### Database
- Better Auth manages its own database tables — run the migration CLI to create them
- Use \`npx better-auth migrate\` or \`npx better-auth generate\` for schema generation
- Session and user data are stored in the database — no JWTs by default`,
  };
}
