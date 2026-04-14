import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function trpcFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.apiStyle, "trpc")) return null;

  return {
    id: "trpc",
    category: "api",
    title: "tRPC",
    priority: 40,
    content: `## tRPC

### Router Structure
- Define routers with \`router()\` and organize by domain: \`userRouter\`, \`postRouter\`, \`commentRouter\`
- Merge sub-routers into an \`appRouter\` with \`router({ user: userRouter, post: postRouter })\`
- Export the \`AppRouter\` type for end-to-end type safety on the client

### Procedures
- Use \`publicProcedure\` for unauthenticated endpoints; create \`protectedProcedure\` with auth middleware for authenticated ones
- Define input validation with Zod schemas: \`.input(z.object({ id: z.string() }))\`
- Use \`.query()\` for read operations (GET-like); \`.mutation()\` for write operations (POST/PUT/DELETE-like)
- Use \`.subscription()\` for real-time WebSocket-based data streams

### Middleware & Context
- Create context in \`createTRPCContext\` — include session, database connection, and request metadata
- Use middleware (\`.use()\`) for cross-cutting concerns: auth checks, logging, rate limiting
- \`protectedProcedure\` is typically a middleware that throws \`UNAUTHORIZED\` if no session exists

### Client Integration
- Use \`@trpc/react-query\` for React: \`trpc.user.getById.useQuery({ id })\`
- Use \`superjson\` as the transformer to support Dates, Maps, Sets, and other non-JSON types
- Use \`trpc.useUtils()\` to invalidate queries after mutations: \`utils.user.getAll.invalidate()\`

### Best Practices
- Keep procedures thin — delegate business logic to service functions
- Use Zod \`.transform()\` and \`.refine()\` in input schemas for data normalization and custom validation
- Use \`TRPCError\` with appropriate codes: \`NOT_FOUND\`, \`BAD_REQUEST\`, \`UNAUTHORIZED\`, \`FORBIDDEN\`
- Batch requests are enabled by default — leverage this for parallel data fetching`,
  };
}
