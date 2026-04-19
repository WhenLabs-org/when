import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function supabaseAuthFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.auth, "supabase-auth")) return null;

  return {
    id: "supabase-auth",
    category: "auth",
    title: "Supabase Auth",
    priority: 52,
    content: `## Supabase Authentication

### Setup
- Initialize the Supabase client with \`createClient(url, anonKey)\`
- For server-side (Next.js), use \`createServerClient\` from \`@supabase/ssr\`
- Store \`SUPABASE_URL\` and \`SUPABASE_ANON_KEY\` in environment variables

### Auth Methods
- Use \`supabase.auth.signInWithPassword()\` for email/password
- Use \`supabase.auth.signInWithOAuth()\` for social providers (Google, GitHub, etc.)
- Use \`supabase.auth.signInWithOtp()\` for magic link or OTP-based login
- Use \`supabase.auth.signUp()\` for new user registration

### Session Management
- Use \`supabase.auth.getSession()\` to check current session
- Use \`supabase.auth.getUser()\` for a verified user (makes a network request)
- Use \`supabase.auth.onAuthStateChange()\` to listen for auth events in the client
- Row Level Security (RLS) policies use \`auth.uid()\` — always enable RLS on user-facing tables

### Best Practices
- Never expose the \`service_role\` key to the client — it bypasses RLS
- Use \`getUser()\` instead of \`getSession()\` for authorization checks on the server
- Set up auth redirects in the Supabase dashboard for OAuth and email confirmation flows`,
  };
}
