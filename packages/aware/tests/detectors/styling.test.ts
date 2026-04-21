import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectStyling } from "../../src/detectors/styling.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectStyling", () => {
  it("detects tailwindcss in nextjs-app", async () => {
    const result = await detectStyling(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("tailwindcss");
  });

  it("returns null for vite-react (no styling dep)", async () => {
    const result = await detectStyling(`${fixtures}/vite-react`);
    expect(result).toBeNull();
  });

  it("returns null for rust-cli (no package.json)", async () => {
    const result = await detectStyling(`${fixtures}/rust-cli`);
    expect(result).toBeNull();
  });
});
