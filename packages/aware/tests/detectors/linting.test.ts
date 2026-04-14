import { describe, it, expect } from "vitest";
import { detectLinting } from "../../src/detectors/linting.js";

const fixtures = new URL("../fixtures", import.meta.url).pathname;

describe("detectLinting", () => {
  it("detects eslint and prettier in nextjs-app", async () => {
    const results = await detectLinting(`${fixtures}/nextjs-app`);
    const names = results.map((r) => r.name);
    expect(names).toContain("eslint");
    expect(names).toContain("prettier");
  });

  it("detects ruff in python-fastapi", async () => {
    const results = await detectLinting(`${fixtures}/python-fastapi`);
    const names = results.map((r) => r.name);
    expect(names).toContain("ruff");
  });
});
