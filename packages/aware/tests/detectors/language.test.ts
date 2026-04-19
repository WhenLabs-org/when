import { describe, it, expect } from "vitest";
import { detectLanguage } from "../../src/detectors/language.js";

const fixtures = new URL("../fixtures", import.meta.url).pathname;

describe("detectLanguage", () => {
  it("detects typescript in nextjs-app", async () => {
    const result = await detectLanguage(`${fixtures}/nextjs-app`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("typescript");
  });

  it("detects rust with version 1.79 in rust-cli", async () => {
    const result = await detectLanguage(`${fixtures}/rust-cli`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("rust");
    expect(result!.version).toContain("1.79");
  });

  it("detects python with version 3.12 in python-fastapi", async () => {
    const result = await detectLanguage(`${fixtures}/python-fastapi`);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("python");
    expect(result!.version).toContain("3.12");
  });

  it("returns null for empty directory", async () => {
    const result = await detectLanguage(`${fixtures}/empty`);
    expect(result).toBeNull();
  });
});
