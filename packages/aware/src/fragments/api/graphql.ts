import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function graphqlFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.apiStyle, "graphql")) return null;

  return {
    id: "graphql",
    category: "api",
    title: "GraphQL",
    priority: 41,
    content: `## GraphQL

### Schema Design
- Choose schema-first (SDL files) or code-first (TypeGraphQL, Nexus, Pothos) based on the project's approach
- Use clear, descriptive type names: \`User\`, \`CreateUserInput\`, \`UserConnection\` (for pagination)
- Define \`Input\` types for mutations — never reuse output types as inputs
- Use enums for constrained fields; custom scalars for DateTime, JSON, etc.

### Resolvers
- Keep resolvers thin — delegate to service/data-access layers
- Resolver signature: \`(parent, args, context, info)\` — use context for auth, DB connections, and DataLoaders
- Return promises from resolvers; the GraphQL execution engine handles async resolution

### N+1 Problem & DataLoader
- Use DataLoader to batch and cache database lookups within a single request
- Create a new DataLoader instance per request (in context) — never share across requests
- DataLoader batches all \`.load(id)\` calls in a single tick into one batch function call

### Mutations
- Name mutations as verbs: \`createUser\`, \`updatePost\`, \`deleteComment\`
- Return the affected object (or a union type with error) so the client can update its cache
- Validate mutation inputs in the resolver; return user-friendly error messages

### Best Practices
- Enable query complexity analysis and depth limiting to prevent abusive queries
- Use persisted queries in production to allow-list known queries and reduce payload size
- Paginate list fields with Relay-style connections (\`edges\`, \`nodes\`, \`pageInfo\`) or simple offset/limit
- Document every field and type with descriptions — they show up in GraphiQL/Apollo Studio`,
  };
}
