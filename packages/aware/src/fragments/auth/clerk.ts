import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function clerkFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.auth, "clerk")) return null;

  return {
    id: "clerk",
    category: "auth",
    title: "Clerk",
    priority: 50,
    content: `## Clerk Authentication

### Setup
- Wrap root layout with \`<ClerkProvider>\` to make auth context available throughout the app
- Set \`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY\` and \`CLERK_SECRET_KEY\` in environment variables
- Configure sign-in/sign-up URLs in environment: \`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in\`

### Client-Side Auth
- Use \`useUser()\` hook for user profile data (name, email, avatar, metadata)
- Use \`useAuth()\` hook for auth state: \`isSignedIn\`, \`userId\`, \`getToken()\`
- Use pre-built Clerk components: \`<SignIn />\`, \`<SignUp />\`, \`<UserButton />\`, \`<UserProfile />\`
- Use \`<SignedIn>\` and \`<SignedOut>\` components for conditional rendering based on auth state

### Middleware & Server
- Use Clerk's \`clerkMiddleware()\` in \`middleware.ts\` to protect routes — configure public/protected route patterns
- Use \`auth()\` from \`@clerk/nextjs/server\` in Server Components and Server Actions for session data
- Use \`currentUser()\` for full user object on the server; \`auth()\` for lightweight session claims

### Best Practices
- Use Clerk's Organizations feature for multi-tenant apps — check \`orgId\` in authorization logic
- Store app-specific user data in Clerk \`publicMetadata\` (readable client-side) or \`privateMetadata\` (server-only)
- Use Clerk webhooks to sync user events (created, updated, deleted) with your database
- Use \`auth().protect()\` for declarative route protection — throws and redirects unauthenticated users`,
  };
}
