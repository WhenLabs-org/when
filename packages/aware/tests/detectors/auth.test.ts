import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectAuth } from "../../src/detectors/auth.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectAuth", () => {
  it("detects nextauth in nextjs-app", async () => {
    const result = await detectAuth(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("nextauth");
  });

  it("returns null for vite-react", async () => {
    const result = await detectAuth(`${fixtures}/vite-react`);
    expect(result).toBeNull();
  });
});
