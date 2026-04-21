import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectDeployment } from "../../src/detectors/deployment.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectDeployment", () => {
  it("detects vercel in nextjs-app", async () => {
    const result = await detectDeployment(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("vercel");
  });

  it("returns null for vite-react", async () => {
    const result = await detectDeployment(`${fixtures}/vite-react`);
    expect(result).toBeNull();
  });
});
