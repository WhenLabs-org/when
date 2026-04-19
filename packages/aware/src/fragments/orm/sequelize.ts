import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function sequelizeFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.orm, "sequelize")) return null;

  return {
    id: "sequelize",
    category: "orm",
    title: "Sequelize",
    priority: 35,
    content: `## Sequelize ORM

### Model Definition
- Prefer \`sequelize.define('Model', { fields })\` or the class-based \`Model.init\` form; stay consistent within a project
- Always declare types on each attribute via \`DataTypes\` — don't rely on implicit inference
- Use singular model names (\`User\`, \`Order\`); Sequelize pluralizes table names automatically (opt out with \`freezeTableName: true\` per-model if you have an existing schema)

### Associations
- Define associations in a separate \`associate\` step after all models load — circular imports otherwise bite
- Name foreign keys explicitly (\`foreignKey: 'userId'\`); relying on Sequelize's defaults locks you into conventions that break on rename
- Prefer \`belongsToMany(..., { through: JoinModel })\` with an explicit join model when the relationship carries its own columns

### Queries
- Use \`findOne\` / \`findAll\` / \`findByPk\` over raw SQL; reach for \`sequelize.query()\` only when the ORM truly can't express the query
- For performance-sensitive reads, set \`raw: true\` to skip model instantiation
- Always use transactions (\`sequelize.transaction\`) for multi-step writes; pass \`{ transaction: t }\` to every call inside

### Migrations
- \`sequelize-cli\` generates migrations in \`migrations/\`; commit both the migration and the schema state
- Never edit a committed migration — add a new one. Editing ships inconsistent schemas across environments`,
  };
}
