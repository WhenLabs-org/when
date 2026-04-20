import type { VariableSchema } from "./types.js";
import { getDefaultRegistry } from "../runtime/registry.js";
import { registerBuiltins } from "../runtime/builtins.js";

export interface ValidatorResult {
  valid: boolean;
  message?: string;
}

let builtinsRegistered = false;
function ensureBuiltins(): void {
  if (builtinsRegistered) return;
  registerBuiltins(getDefaultRegistry());
  builtinsRegistered = true;
}

export function validateValue(
  value: string,
  schema: VariableSchema,
): ValidatorResult {
  ensureBuiltins();
  const registry = getDefaultRegistry();
  const def = registry.getValidator(schema.type);
  if (!def) {
    return { valid: false, message: `Unknown type "${schema.type}"` };
  }
  const result = def.validate(value, schema, { env: {}, name: "" });
  return result.valid
    ? { valid: true }
    : { valid: false, message: result.message };
}
