import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function typeormFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.orm, "typeorm")) return null;

  return {
    id: "typeorm",
    category: "orm",
    title: "TypeORM",
    priority: 31,
    content: `## TypeORM

### Entities
- Define entities as classes decorated with \`@Entity()\` — each entity maps to a database table
- Use \`@PrimaryGeneratedColumn()\` for auto-incrementing IDs or \`@PrimaryGeneratedColumn('uuid')\` for UUIDs
- Define columns with \`@Column()\` — specify type, nullable, default, and unique constraints as options
- Use \`@CreateDateColumn()\` and \`@UpdateDateColumn()\` for automatic timestamp management

### Repository Pattern
- Access repositories with \`dataSource.getRepository(Entity)\` or inject them in frameworks like NestJS
- Use \`find()\`, \`findOne()\`, \`findOneBy()\` for queries with \`where\`, \`relations\`, \`select\`, and \`order\` options
- Use \`save()\` for insert or update (upsert by primary key), \`remove()\` for deletion
- Use \`create()\` to instantiate an entity without saving — then call \`save()\` to persist

### Relations
- Define relations with \`@ManyToOne\`, \`@OneToMany\`, \`@OneToOne\`, \`@ManyToMany\` decorators
- Always specify the inverse side of bidirectional relations for proper loading
- Use \`{ eager: true }\` on a relation to auto-load it, or load explicitly with \`relations\` option in \`find()\`
- Use \`@JoinColumn()\` on the owning side of \`@OneToOne\` and \`@ManyToOne\` relations

### QueryBuilder
- Use QueryBuilder for complex queries: \`repo.createQueryBuilder('user').where('user.age > :age', { age: 18 })\`
- Chain \`.leftJoinAndSelect()\`, \`.orderBy()\`, \`.skip()\`, \`.take()\` for joins, sorting, and pagination
- Use \`.getMany()\` or \`.getOne()\` to execute and return typed entities
- Use parameterized queries (\`:param\`) — never interpolate user input into query strings

### Migrations
- Generate migrations with \`typeorm migration:generate -n MigrationName\` based on entity changes
- Run migrations with \`typeorm migration:run\`; revert with \`typeorm migration:revert\`
- Review generated migration SQL before running — auto-generated migrations can include unintended changes

### Configuration
- Configure the DataSource in a dedicated file (\`data-source.ts\`) with database credentials, entities, and migrations
- Use environment variables for database connection details — never hardcode credentials
- Enable \`synchronize: true\` only in development — never in production (it can drop data)`,
  };
}
