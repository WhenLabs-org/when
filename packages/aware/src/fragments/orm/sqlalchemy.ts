import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function sqlalchemyFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.orm, "sqlalchemy")) return null;

  return {
    id: "sqlalchemy",
    category: "orm",
    title: "SQLAlchemy",
    priority: 31,
    content: `## SQLAlchemy

### Model Definition
- Use the declarative style with \`mapped_column()\` and \`Mapped[T]\` type annotations (SQLAlchemy 2.0+)
- Define a \`Base = DeclarativeBase()\` and inherit all models from it
- Use \`__tablename__\` to set explicit table names; prefer snake_case matching your database convention
- Define relationships with \`relationship()\` and \`ForeignKey\` — always set \`back_populates\` bidirectionally

### Session Management
- Always use session context managers: \`with Session(engine) as session:\` — ensures cleanup on errors
- For async: use \`async with AsyncSession(engine) as session:\` with \`asyncio\`-compatible driver (asyncpg, aiosqlite)
- Commit explicitly with \`session.commit()\`; use \`session.flush()\` to get generated IDs without committing
- Never share sessions across threads or async tasks

### Queries (2.0 Style)
- Use \`select(Model).where(Model.column == value)\` with \`session.execute()\` — returns \`Result\` objects
- Use \`session.scalars(select(Model)).all()\` to get model instances directly
- Use \`joinedload()\`, \`selectinload()\` for eager loading relations to avoid N+1 queries
- Use \`.options()\` for query-specific loading strategies

### Migrations with Alembic
- Initialize with \`alembic init alembic\`; auto-generate migrations with \`alembic revision --autogenerate -m "description"\`
- Always review auto-generated migrations — Alembic can miss renames and data migrations
- Run \`alembic upgrade head\` to apply; \`alembic downgrade -1\` to rollback one step
- Keep migration scripts idempotent when possible

### Best Practices
- Use \`create_async_engine()\` for async applications; configure pool size with \`pool_size\` and \`max_overflow\`
- Index frequently filtered columns with \`index=True\` on \`mapped_column()\`
- Use \`session.get(Model, pk)\` for primary key lookups — it checks the identity map first
- Use bulk operations (\`session.add_all()\`, \`insert().values([...])\`) for batch inserts`,
  };
}
