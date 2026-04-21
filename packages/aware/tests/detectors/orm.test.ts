import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { detectOrm } from "../../src/detectors/orm.js";

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("detectOrm", () => {
  it("detects drizzle in nextjs-app", async () => {
    const result = await detectOrm(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("drizzle");
  });

  it("detects sqlalchemy in python-fastapi", async () => {
    const result = await detectOrm(`${fixtures}/python-fastapi`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("sqlalchemy");
  });

  it("returns null for vite-react", async () => {
    const result = await detectOrm(`${fixtures}/vite-react`);
    expect(result).toBeNull();
  });
});
