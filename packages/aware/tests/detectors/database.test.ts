import { describe, it, expect } from "vitest";
import { detectDatabase } from "../../src/detectors/database.js";

const fixtures = new URL("../fixtures", import.meta.url).pathname;

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
