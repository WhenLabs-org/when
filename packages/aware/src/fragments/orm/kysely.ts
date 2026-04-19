import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function kyselyFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.orm, "kysely")) return null;

  return {
    id: "kysely",
    category: "orm",
    title: "Kysely",
    priority: 32,
    content: `## Kysely Query Builder

### Setup
- Define the database interface with typed table schemas
- Create the Kysely instance with the appropriate dialect (PostgreSQL, MySQL, SQLite)
- Use \`kysely-codegen\` to auto-generate types from your database schema

### Queries
- Use the fluent API: \`db.selectFrom('table').select(['col1', 'col2']).where('id', '=', id)\`
- All queries are fully type-safe — column names and types are checked at compile time
- Use \`.$narrowType<T>()\` for type narrowing in conditional selections
- Use transactions with \`db.transaction().execute(async (trx) => { ... })\`

### Migrations
- Create migrations in a dedicated directory with \`Migrator\` and file-based migration provider
- Migrations export \`up\` and \`down\` functions using the \`Kysely<any>\` type
- Run migrations programmatically or via a custom CLI script

### Best Practices
- Use \`insertInto().values().returning()\` to get inserted rows
- Use \`with\` (CTEs) for complex queries instead of subqueries where possible
- Prefer parameterized queries (default) — never use \`sql.raw()\` with user input`,
  };
}
