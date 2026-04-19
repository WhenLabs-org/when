import { describe, it, expect } from "vitest";
import { exitCodeFor } from "../../src/diff/drift-report.js";

describe("exitCodeFor", () => {
  it("maps severity to canonical CI exit codes", () => {
    expect(exitCodeFor("none")).toBe(0);
    expect(exitCodeFor("warn")).toBe(1);
    expect(exitCodeFor("tamper")).toBe(2);
  });
});
