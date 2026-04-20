import type { VariableSchema } from "../schema/types.js";

export type ValidatorResult =
  | { valid: true }
  | { valid: false; message: string };

export interface ValidatorCtx {
  /** Full environment being validated (handy for cross-variable checks). */
  env: Record<string, string>;
  /** Variable name being validated. */
  name: string;
}

export interface ValidatorDefinition {
  name: string;
  validate: (
    value: string,
    schema: VariableSchema,
    ctx: ValidatorCtx,
  ) => ValidatorResult;
  /** Hint for codegen. */
  typeHint?: "string" | "number" | "boolean" | "json" | "array";
}

export class Registry {
  private validators = new Map<string, ValidatorDefinition>();

  registerValidator(def: ValidatorDefinition): void {
    this.validators.set(def.name, def);
  }

  getValidator(name: string): ValidatorDefinition | undefined {
    return this.validators.get(name);
  }

  validatorNames(): string[] {
    return [...this.validators.keys()];
  }
}

let defaultRegistry: Registry | undefined;

export function getDefaultRegistry(): Registry {
  if (!defaultRegistry) {
    defaultRegistry = new Registry();
  }
  return defaultRegistry;
}

export function resetDefaultRegistry(): void {
  defaultRegistry = undefined;
}
