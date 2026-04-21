import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectCicd } from "../../src/detectors/cicd.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectCicd", () => {
  it("detects github-actions in nextjs-app", async () => {
    const result = await detectCicd(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("github-actions");
    expect(result!.detectedFrom).toBe(".github/workflows/");
  });

  it("returns null for vite-react (no CI config)", async () => {
    const result = await detectCicd(`${fixtures}/vite-react`);
    expect(result).toBeNull();
  });

  it("returns null for empty project", async () => {
    const result = await detectCicd(`${fixtures}/empty`);
    expect(result).toBeNull();
  });
});
