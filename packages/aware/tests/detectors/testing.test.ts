import { describe, it, expect } from "vitest";
import { detectTesting } from "../../src/detectors/testing.js";

const fixtures = new URL("../fixtures", import.meta.url).pathname;

describe("detectTesting", () => {
  it("detects vitest and playwright in nextjs-app", async () => {
    const results = await detectTesting(`${fixtures}/nextjs-app`);
    const names = results.map((r) => r.name);
    expect(names).toContain("vitest");
    expect(names).toContain("playwright");
  });

  it("detects vitest in fastify-api", async () => {
    const results = await detectTesting(`${fixtures}/fastify-api`);
    const names = results.map((r) => r.name);
    expect(names).toContain("vitest");
  });

  it("returns empty array for empty directory", async () => {
    const results = await detectTesting(`${fixtures}/empty`);
    expect(results).toEqual([]);
  });
});
