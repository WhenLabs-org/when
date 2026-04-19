import type { SecretProvider } from "../runtime/registry.js";

/**
 * HashiCorp Vault KV v2 provider. Reference format:
 *   @vault:secret/data/myapp#DATABASE_URL
 *
 * Uses the `VAULT_ADDR` and `VAULT_TOKEN` environment variables by default.
 * Returns the raw string value at the given field.
 */
export function vaultProvider(
  options: { addr?: string; token?: string; fetch?: typeof fetch } = {},
): SecretProvider {
  const fetchFn = options.fetch ?? globalThis.fetch;
  return {
    scheme: "vault",
    async resolve(payload, ctx) {
      const addr = options.addr ?? process.env.VAULT_ADDR;
      const token = options.token ?? process.env.VAULT_TOKEN;
      if (!addr) throw new Error("VAULT_ADDR is not set");
      if (!token) throw new Error("VAULT_TOKEN is not set");

      const hashIdx = payload.lastIndexOf("#");
      if (hashIdx < 0) {
        throw new Error(
          `Vault ref "${payload}" must include a field (e.g. path#FIELD)`,
        );
      }
      const secretPath = payload.slice(0, hashIdx);
      const field = payload.slice(hashIdx + 1);

      const url = new URL(`/v1/${secretPath}`, addr).toString();
      const res = await fetchFn(url, {
        headers: { "X-Vault-Token": token },
        signal: ctx.signal,
      });
      if (!res.ok) {
        throw new Error(
          `Vault request failed: ${res.status} ${res.statusText}`,
        );
      }
      const body = (await res.json()) as {
        data?: { data?: Record<string, string> };
      };
      const value = body.data?.data?.[field];
      if (value === undefined) {
        throw new Error(`Vault secret ${secretPath} has no field "${field}"`);
      }
      return value;
    },
  };
}
