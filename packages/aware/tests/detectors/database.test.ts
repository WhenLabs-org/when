import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectDatabase } from "../../src/detectors/database.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectDatabase", () => {
  it("detects postgres in nextjs-app from .env DATABASE_URL", async () => {
    const result = await detectDatabase(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("postgres");
  });

  it("returns null for vite-react", async () => {
    const result = await detectDatabase(`${fixtures}/vite-react`);
    expect(result).toBeNull();
  });
});
