import { describe, it, expect } from "vitest";
import {
  parseSecretRef,
  resolveSecrets,
  createMemoryCache,
  defineProvider,
} from "../../src/providers/index.js";
import { Registry } from "../../src/runtime/registry.js";

describe("parseSecretRef", () => {
  it("parses well-formed refs", () => {
    expect(parseSecretRef("@vault:secret/data/x#field")).toEqual({
      scheme: "vault",
      payload: "secret/data/x#field",
    });
  });
  it("returns undefined for non-refs", () => {
    expect(parseSecretRef("plain-value")).toBeUndefined();
    expect(parseSecretRef("@missing-colon")).toBeUndefined();
    expect(parseSecretRef("@Bad:value")).toBeUndefined();
  });
});

describe("resolveSecrets", () => {
  function makeReg(): Registry {
    const reg = new Registry();
    reg.registerProvider(
      defineProvider("vault", async (payload) => `resolved:${payload}`),
    );
    reg.registerProvider(
      defineProvider("flaky", async () => {
        throw new Error("nope");
      }),
    );
    return reg;
  }

  it("leaves non-ref values untouched", async () => {
    const { variables, results, sensitiveKeys } = await resolveSecrets(
      { PLAIN: "hello", DB_URL: "@vault:secret/data/db#url" },
      { registry: makeReg(), live: true },
    );
    expect(variables.PLAIN).toBe("hello");
    expect(variables.DB_URL).toBe("resolved:secret/data/db#url");
    expect(sensitiveKeys.has("DB_URL")).toBe(true);
    expect(sensitiveKeys.has("PLAIN")).toBe(false);
    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(true);
  });

  it("skips when not live", async () => {
    const { variables, results } = await resolveSecrets(
      { DB_URL: "@vault:secret/data/db#url" },
      { registry: makeReg(), live: false },
    );
    expect(variables.DB_URL).toBe("@vault:secret/data/db#url");
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/skipped/);
  });

  it("returns structured failure for missing providers", async () => {
    const { results } = await resolveSecrets(
      { X: "@unknown:foo" },
      { registry: new Registry(), live: true },
    );
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/No provider/);
  });

  it("retries and surfaces provider errors", async () => {
    const reg = new Registry();
    let attempts = 0;
    reg.registerProvider(
      defineProvider("flaky", async () => {
        attempts++;
        throw new Error("boom");
      }),
    );
    const { results } = await resolveSecrets(
      { X: "@flaky:foo" },
      { registry: reg, live: true, retries: 2 },
    );
    expect(attempts).toBe(3);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toBe("boom");
  });

  it("caches within TTL", async () => {
    const reg = new Registry();
    let calls = 0;
    reg.registerProvider(
      defineProvider("vault", async () => {
        calls++;
        return "value";
      }),
    );
    const cache = createMemoryCache(60_000);
    await resolveSecrets(
      { A: "@vault:x", B: "@vault:x" },
      { registry: reg, live: true, cache },
    );
    expect(calls).toBe(1);
  });
});
