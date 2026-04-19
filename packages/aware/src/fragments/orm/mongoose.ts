import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function mongooseFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.orm, "mongoose")) return null;

  return {
    id: "mongoose",
    category: "orm",
    title: "Mongoose",
    priority: 31,
    content: `## Mongoose

### Schema Definition
- Define schemas with \`new Schema({ ... })\` — specify field types, required, default, and validation rules
- Create models with \`model('ModelName', schema)\` — the model name determines the MongoDB collection (lowercased, pluralized)
- Use SchemaTypes: \`String\`, \`Number\`, \`Boolean\`, \`Date\`, \`ObjectId\`, \`Array\`, \`Map\`, \`Mixed\`
- Add indexes in the schema with \`{ index: true }\` on fields or \`schema.index({ field1: 1, field2: -1 })\` for compound indexes

### Queries
- Use \`find()\`, \`findOne()\`, \`findById()\` for reads — chain \`.select()\`, \`.sort()\`, \`.limit()\`, \`.skip()\` for shaping results
- Use \`.lean()\` on queries that only read data — it returns plain objects instead of Mongoose documents, improving performance
- Use \`populate('fieldName')\` to resolve ObjectId references to full documents — specify \`select\` to limit populated fields
- Use \`countDocuments()\` instead of \`count()\` — \`count()\` is deprecated

### Middleware (Hooks)
- Use \`schema.pre('save', function() { ... })\` for logic before saving (e.g., hashing passwords, setting defaults)
- Use \`schema.post('save', function(doc) { ... })\` for logic after saving (e.g., logging, notifications)
- Middleware is available for \`validate\`, \`save\`, \`remove\`, \`find\`, \`findOneAndUpdate\`, and more
- Use \`this\` in pre-save hooks to access the document — in query middleware, \`this\` refers to the query

### Virtuals & Methods
- Use \`schema.virtual('fullName').get(function() { ... })\` for computed fields that are not stored in the database
- Add instance methods with \`schema.methods.methodName = function() { ... }\` for document-level logic
- Add static methods with \`schema.statics.methodName = function() { ... }\` for model-level queries
- Use discriminators (\`Model.discriminator('SubModel', subSchema)\`) for single-collection inheritance

### Best Practices
- Always handle connection errors: \`mongoose.connect(uri).catch(err => ...)\`
- Use \`mongoose.set('strictQuery', true)\` to prevent queries on fields not in the schema
- Define schemas in separate files — export the model, not the schema
- Use transactions (\`session.startTransaction()\`) for multi-document operations that must be atomic
- Validate data at the schema level with built-in validators or custom \`validate\` functions`,
  };
}
