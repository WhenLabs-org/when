import { describe, it, expect } from "vitest";
import { detectBundler } from "../../src/detectors/bundler.js";

const fixtures = new URL("../fixtures", import.meta.url).pathname;

describe("detectBundler", () => {
  it("detects vite in vite-react fixture", async () => {
    const result = await detectBundler(`${fixtures}/vite-react`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("vite");
  });

  it("returns null for rust-cli", async () => {
    const result = await detectBundler(`${fixtures}/rust-cli`);
    expect(result).toBeNull();
  });

  it("returns null for empty project", async () => {
    const result = await detectBundler(`${fixtures}/empty`);
    expect(result).toBeNull();
  });
});
