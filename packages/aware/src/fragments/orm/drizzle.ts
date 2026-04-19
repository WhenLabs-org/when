import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function drizzleFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.orm, "drizzle")) return null;

  return {
    id: "drizzle",
    category: "orm",
    title: "Drizzle ORM",
    priority: 30,
    content: `## Drizzle ORM

### Schema Definition
- Define schemas in dedicated files (e.g., \`src/db/schema/users.ts\`) and barrel-export from \`src/db/schema/index.ts\`
- Use the dialect-specific column builders: \`pgTable\`, \`mysqlTable\`, or \`sqliteTable\`
- Define relations with \`relations()\` for type-safe relational queries
- Use \`$inferSelect\` and \`$inferInsert\` to derive TypeScript types from table definitions — never manually duplicate types

### Queries
- Use the query builder API (\`db.select().from(users).where(eq(users.id, id))\`) for most operations
- Use the relational query API (\`db.query.users.findMany({ with: { posts: true } })\`) for nested/related data
- Prefer parameterized queries — Drizzle handles SQL injection prevention automatically
- Avoid raw SQL (\`sql\\\`...\\\`\`) unless doing something the query builder cannot express (window functions, CTEs)

### Migrations
- Use \`drizzle-kit\` CLI: \`drizzle-kit generate\` to create migration files from schema changes
- Run \`drizzle-kit migrate\` to apply migrations; \`drizzle-kit push\` for rapid prototyping (no migration files)
- Review generated SQL migrations before applying to production — auto-generated migrations can be destructive
- Keep \`drizzle.config.ts\` in project root with schema paths and connection config

### Best Practices
- Use transactions (\`db.transaction(async (tx) => { ... })\`) for multi-statement operations that must be atomic
- Use \`.returning()\` on insert/update/delete to get affected rows without a separate query
- Use \`.$defaultFn()\` for generated default values (UUIDs, timestamps)
- Index frequently queried columns — define indexes in schema with \`.index()\``,
  };
}
