import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectFramework } from "../../src/detectors/framework.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectFramework", () => {
  it("detects Next.js app-router in nextjs-app", async () => {
    const result = await detectFramework(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("nextjs");
    expect(result!.variant).toBe("app-router");
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it("detects vite-react in vite-react", async () => {
    const result = await detectFramework(`${fixtures}/vite-react`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("vite-react");
  });

  it("detects fastify in fastify-api", async () => {
    const result = await detectFramework(`${fixtures}/fastify-api`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("fastify");
  });

  it("detects rust cli in rust-cli", async () => {
    const result = await detectFramework(`${fixtures}/rust-cli`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("rust");
    expect(result!.variant).toBe("cli");
  });

  it("detects fastapi in python-fastapi", async () => {
    const result = await detectFramework(`${fixtures}/python-fastapi`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("fastapi");
  });

  it("returns null for empty directory", async () => {
    const result = await detectFramework(`${fixtures}/empty`);
    expect(result).toBeNull();
  });
});
