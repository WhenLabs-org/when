import { describe, it, expect, beforeEach } from "vitest";
import { validateAsync } from "../../src/commands/validate.js";
import {
  Registry,
  type ValidatorDefinition,
} from "../../src/runtime/registry.js";
import { registerBuiltins } from "../../src/runtime/builtins.js";
import type { EnvSchema } from "../../src/schema/types.js";

function makeRegistry(extra: ValidatorDefinition[] = []): Registry {
  const reg = new Registry();
  registerBuiltins(reg);
  for (const v of extra) reg.registerValidator(v);
  return reg;
}

describe("validateAsync", () => {
  let dnsLookups: string[];

  beforeEach(() => {
    dnsLookups = [];
  });

  const hostReachable: ValidatorDefinition = {
    name: "host-reachable",
    typeHint: "string",
    async: true,
    validate: async (value) => {
      dnsLookups.push(value);
      return value.includes("ok")
        ? { valid: true }
        : { valid: false, message: `host ${value} is down` };
    },
  };

  const schema: EnvSchema = {
    version: 1,
    variables: {
      API_HOST: { type: "host-reachable", required: true },
      PORT: { type: "integer", required: true, range: [1, 65535] },
    },
  };

  it("skips async validators without --check-live", async () => {
    const registry = makeRegistry([hostReachable]);
    const result = await validateAsync(
      schema,
      { path: ".env", variables: { API_HOST: "api.ok.test", PORT: "3000" } },
      { registry },
    );
    expect(dnsLookups).toEqual([]);
    expect(result.valid).toBe(true);
    const skipped = result.issues.find(
      (i) => i.kind === "live-check-skipped" && i.variable === "API_HOST",
    );
    expect(skipped).toBeDefined();
  });

  it("runs async validators when checkLive is true", async () => {
    const registry = makeRegistry([hostReachable]);
    const good = await validateAsync(
      schema,
      { path: ".env", variables: { API_HOST: "api.ok.test", PORT: "3000" } },
      { registry, checkLive: true },
    );
    expect(good.valid).toBe(true);
    expect(dnsLookups).toContain("api.ok.test");

    const bad = await validateAsync(
      schema,
      { path: ".env", variables: { API_HOST: "api.bad.test", PORT: "3000" } },
      { registry, checkLive: true },
    );
    expect(bad.valid).toBe(false);
    const failed = bad.issues.find((i) => i.variable === "API_HOST");
    expect(failed?.kind).toBe("live-check-failed");
  });

  it("caps concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow: ValidatorDefinition = {
      name: "slow",
      async: true,
      validate: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
        return { valid: true };
      },
    };
    const registry = makeRegistry([slow]);
    const vars: Record<string, string> = {};
    const variables: Record<string, { type: string; required: boolean }> = {};
    for (let i = 0; i < 20; i++) {
      vars[`V${i}`] = "x";
      variables[`V${i}`] = { type: "slow", required: true };
    }
    const bigSchema: EnvSchema = { version: 1, variables: variables as any };
    await validateAsync(
      bigSchema,
      { path: ".env", variables: vars },
      { registry, checkLive: true, concurrency: 3 },
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("emits issues in stable alphabetical order", async () => {
    const registry = makeRegistry();
    const s: EnvSchema = {
      version: 1,
      variables: {
        ZEBRA: { type: "integer", required: true },
        ALPHA: { type: "integer", required: true },
        MIKE: { type: "integer", required: true },
      },
    };
    const result = await validateAsync(
      s,
      { path: ".env", variables: {} },
      { registry },
    );
    const order = result.issues.map((i) => i.variable);
    expect(order).toEqual(["ALPHA", "MIKE", "ZEBRA"]);
  });
});
