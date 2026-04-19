import type { SecretProvider } from "../runtime/registry.js";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

type OpRunner = (args: string[]) => SpawnSyncReturns<string>;

/**
 * 1Password provider. Reference format follows the standard `op://` URI:
 *   @1password:op://vault/item/field
 *
 * Uses the `op` CLI under the hood so we don't require the beta SDK. Falls
 * back to `OP_SERVICE_ACCOUNT_TOKEN` if present.
 */
export function onepasswordProvider(
  options: { run?: OpRunner } = {},
): SecretProvider {
  const run: OpRunner =
    options.run ??
    ((args) =>
      spawnSync("op", args, {
        encoding: "utf-8",
        env: process.env,
      }));

  return {
    scheme: "1password",
    async resolve(payload) {
      const ref = payload.startsWith("op://") ? payload : `op://${payload}`;
      const result = run(["read", ref]);
      if (result.error) {
        throw new Error(
          `1Password CLI error: ${(result.error as Error).message}`,
        );
      }
      if (result.status !== 0) {
        const stderr = (result.stderr ?? "").trim();
        throw new Error(
          `1Password lookup failed (${result.status}): ${stderr || "no stderr"}`,
        );
      }
      return (result.stdout ?? "").replace(/\n$/, "");
    },
  };
}
