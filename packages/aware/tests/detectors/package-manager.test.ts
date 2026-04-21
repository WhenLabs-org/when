import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectPackageManager } from "../../src/detectors/package-manager.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectPackageManager", () => {
  it("detects pnpm in nextjs-app (pnpm-lock.yaml)", async () => {
    const result = await detectPackageManager(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("pnpm");
  });

  it("detects npm in vite-react (package-lock.json)", async () => {
    const result = await detectPackageManager(`${fixtures}/vite-react`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("npm");
  });

  it("detects yarn in fastify-api (yarn.lock)", async () => {
    const result = await detectPackageManager(`${fixtures}/fastify-api`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("yarn");
  });

  it("detects cargo in rust-cli (Cargo.lock)", async () => {
    const result = await detectPackageManager(`${fixtures}/rust-cli`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("cargo");
  });
});
