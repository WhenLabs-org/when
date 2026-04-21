import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectStateManagement } from "../../src/detectors/state-management.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectStateManagement", () => {
  it("detects zustand in nextjs-app", async () => {
    const result = await detectStateManagement(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("zustand");
    expect(result!.version).toBe("5.0");
  });

  it("returns null for rust-cli", async () => {
    const result = await detectStateManagement(`${fixtures}/rust-cli`);
    expect(result).toBeNull();
  });

  it("returns null for empty project", async () => {
    const result = await detectStateManagement(`${fixtures}/empty`);
    expect(result).toBeNull();
  });
});
