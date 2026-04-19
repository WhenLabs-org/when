import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function prismaFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.orm, "prisma")) return null;

  return {
    id: "prisma",
    category: "orm",
    title: "Prisma ORM",
    priority: 30,
    content: `## Prisma ORM

### Schema & Client
- Schema lives in \`prisma/schema.prisma\` — single source of truth for database models
- Run \`prisma generate\` after every schema change to regenerate the typed client
- Use a singleton pattern for the Prisma client in development to avoid exhausting connections during HMR
- Run \`prisma db push\` for prototyping; \`prisma migrate dev\` for migration-tracked schema changes

### Queries
- Use \`select\` to pick specific fields or \`include\` to load relations — never fetch more data than needed
- Paginate with \`findMany({ skip, take, cursor })\` — use cursor-based pagination for large datasets
- Use \`findUnique\` for primary key / unique field lookups; \`findFirst\` when you expect one result with non-unique filters
- Use \`createMany\`, \`updateMany\`, \`deleteMany\` for bulk operations

### Transactions
- Use \`prisma.$transaction([...])\` for sequential operations that must all succeed or all fail
- Use the interactive transaction API \`prisma.$transaction(async (tx) => { ... })\` for complex logic with conditional writes
- Keep transactions short — long-running transactions hold database locks

### Relations
- Define relations bidirectionally in the schema (\`@relation\` on both models)
- Use nested writes for creating/connecting related records in a single operation: \`create({ data: { posts: { create: [...] } } })\`
- Use \`connect\`, \`disconnect\`, \`set\` for modifying relation links on update

### Best Practices
- Use \`@default(uuid())\` or \`@default(cuid())\` for ID generation; \`@default(now())\` for timestamps
- Add \`@@index\` for columns used in \`where\`, \`orderBy\`, or join conditions
- Use \`@map\` and \`@@map\` to keep Prisma model names PascalCase while database uses snake_case
- Validate data before sending to Prisma — Prisma is not a validation layer`,
  };
}
