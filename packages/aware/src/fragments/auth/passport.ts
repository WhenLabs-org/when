import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function passportFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.auth, "passport")) return null;

  return {
    id: "passport",
    category: "auth",
    title: "Passport.js",
    priority: 55,
    content: `## Passport.js Authentication

### Strategy Registration
- Register one strategy per auth method (\`passport-local\`, \`passport-jwt\`, \`passport-google-oauth20\`, etc.)
- Keep \`passport.use(new Strategy(...))\` calls in a single \`src/auth/strategies.ts\` (or similar) file so configuration is discoverable
- Load all credentials from env; never hard-code client IDs or JWT secrets

### Sessions vs Tokens
- For session-based auth: enable \`passport.serializeUser\` / \`passport.deserializeUser\`, then use \`express-session\` (+ a real store like connect-redis — not the default MemoryStore in production)
- For JWT-based auth: disable sessions (\`{ session: false }\` per strategy and route) and authenticate every request via the JWT strategy
- Don't mix: a hybrid session + JWT app usually has two Passport setups rather than one

### Route Protection
- Use \`passport.authenticate('<strategy>', { session: <bool> })\` as middleware on protected routes
- Centralize the "is authenticated" predicate (\`req.isAuthenticated()\` for sessions, a \`requireJwt\` wrapper for JWTs) — avoid repeating the check inline
- Always return 401 consistently on auth failure; don't silently leak "user not found" vs "bad password"

### TypeScript
- Declare the \`req.user\` shape once via \`declare global { namespace Express { interface User { ... } } }\` — otherwise every route re-asserts the type`,
  };
}
