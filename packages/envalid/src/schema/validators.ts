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

/**
 * Sync-only validator dispatch kept for backwards compatibility. Plugins that
 * register async validators should be invoked through `validateAsync`.
 */
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
  if (def.async) {
    // Async validators can't run synchronously; treat as skipped.
    return { valid: true };
  }
  const result = def.validate(value, schema, {
    env: {},
    name: "",
    live: false,
  });
  if (result instanceof Promise) {
    // Shouldn't happen for sync definitions, but guard anyway.
    return { valid: true };
  }
  return result.valid
    ? { valid: true }
    : { valid: false, message: result.message };
}
