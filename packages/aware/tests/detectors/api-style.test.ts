import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectApiStyle } from "../../src/detectors/api-style.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectApiStyle", () => {
  it("detects trpc in nextjs-app", async () => {
    const result = await detectApiStyle(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("trpc");
  });

  it("detects rest fallback in fastify-api", async () => {
    const result = await detectApiStyle(`${fixtures}/fastify-api`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("rest");
  });

  it("returns null for vite-react", async () => {
    const result = await detectApiStyle(`${fixtures}/vite-react`);
    expect(result).toBeNull();
  });
});
