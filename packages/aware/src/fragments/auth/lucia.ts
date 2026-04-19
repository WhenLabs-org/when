import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function luciaFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.auth, "lucia")) return null;

  return {
    id: "lucia",
    category: "auth",
    title: "Lucia Auth",
    priority: 52,
    content: `## Lucia Authentication

### Setup
- Lucia is a session-based auth library — it handles sessions, not OAuth flows directly
- Define the Lucia instance with your database adapter in a shared file (e.g., \`src/lib/auth.ts\`)
- Use the appropriate database adapter (e.g., Drizzle, Prisma, or built-in adapters)

### Sessions
- Create sessions with \`lucia.createSession(userId, attributes)\`
- Validate sessions with \`lucia.validateSession(sessionId)\` — returns both session and user
- Store the session ID in a cookie — use \`lucia.createSessionCookie()\` and \`lucia.createBlankSessionCookie()\`
- Invalidate sessions on logout with \`lucia.invalidateSession(sessionId)\`

### Integration
- Use \`arctic\` for OAuth provider integration (GitHub, Google, Discord, etc.)
- Middleware depends on framework — check the framework-specific guide for cookie handling
- For API routes, validate the session from the \`Authorization\` header or cookies
- Always check session validity on protected routes — never trust client-side auth state alone`,
  };
}
