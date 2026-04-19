import type { VariableSchema } from "../schema/types.js";

export type ValidatorResult =
  | { valid: true }
  | { valid: false; message: string };

export interface ValidatorCtx {
  /** Full environment being validated (handy for cross-variable checks). */
  env: Record<string, string>;
  /** Variable name being validated. */
  name: string;
  /** Network/IO capability toggle. */
  live: boolean;
  /** Abort signal plumbed through from the runtime. */
  signal?: AbortSignal;
}

export interface ValidatorDefinition {
  name: string;
  /** Sync or async validator. Async validators are skipped unless live is true. */
  validate: (
    value: string,
    schema: VariableSchema,
    ctx: ValidatorCtx,
  ) => ValidatorResult | Promise<ValidatorResult>;
  /** Hint for codegen and JSON-Schema export. */
  typeHint?: "string" | "number" | "boolean" | "json" | "array";
  /** Requires network/IO; skipped unless --check-live is passed. */
  async?: boolean;
  /** Optional JSON-Schema fragment for the export command. */
  toJsonSchema?: (schema: VariableSchema) => Record<string, unknown>;
}

export interface SecretProvider {
  /** e.g. "vault", "aws-sm", "doppler", "1password" */
  scheme: string;
  resolve: (
    ref: string,
    ctx: { signal?: AbortSignal },
  ) => Promise<string>;
}

export interface EnvalidPlugin {
  name: string;
  validators?: ValidatorDefinition[];
  providers?: SecretProvider[];
}

export class Registry {
  private validators = new Map<string, ValidatorDefinition>();
  private providers = new Map<string, SecretProvider>();

  registerValidator(def: ValidatorDefinition): void {
    this.validators.set(def.name, def);
  }

  registerProvider(provider: SecretProvider): void {
    this.providers.set(provider.scheme, provider);
  }

  registerPlugin(plugin: EnvalidPlugin): void {
    plugin.validators?.forEach((v) => this.registerValidator(v));
    plugin.providers?.forEach((p) => this.registerProvider(p));
  }

  getValidator(name: string): ValidatorDefinition | undefined {
    return this.validators.get(name);
  }

  getProvider(scheme: string): SecretProvider | undefined {
    return this.providers.get(scheme);
  }

  validatorNames(): string[] {
    return [...this.validators.keys()];
  }

  providerSchemes(): string[] {
    return [...this.providers.keys()];
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

export function definePlugin(plugin: EnvalidPlugin): EnvalidPlugin {
  return plugin;
}
