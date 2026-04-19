import { describe, it, expect } from "vitest";
import {
  classifyTestPath,
  extractTestLayout,
} from "../../src/conventions/tests.js";

describe("classifyTestPath", () => {
  it("recognizes __tests__/ directories", () => {
    expect(classifyTestPath("src/foo/__tests__/foo.test.ts")).toBe("__tests__");
  });

  it("recognizes separate top-level test dirs", () => {
    expect(classifyTestPath("tests/foo.test.ts")).toBe("separate-dir");
    expect(classifyTestPath("test/foo.spec.ts")).toBe("separate-dir");
    expect(classifyTestPath("e2e/login.test.ts")).toBe("separate-dir");
  });

  it("recognizes colocated tests", () => {
    expect(classifyTestPath("src/foo/bar.test.ts")).toBe("colocated");
    expect(classifyTestPath("src/foo/bar.spec.js")).toBe("colocated");
    expect(classifyTestPath("pkg/module_test.go")).toBe("colocated");
  });

  it("returns null for files that aren't obviously tests", () => {
    expect(classifyTestPath("src/foo/bar.ts")).toBeNull();
  });
});

describe("extractTestLayout", () => {
  it("picks colocated when every test is next to source", () => {
    const tests = [
      "src/auth/login.test.ts",
      "src/orders/order.test.ts",
      "src/lib/utils.test.ts",
    ];
    const result = extractTestLayout(tests);
    expect(result.layout).toBe("colocated");
    expect(result.confidence).toBe(1);
  });

  it("picks separate-dir when tests live under tests/", () => {
    const tests = [
      "tests/auth.test.ts",
      "tests/orders.test.ts",
      "tests/utils.test.ts",
    ];
    const result = extractTestLayout(tests);
    expect(result.layout).toBe("separate-dir");
  });

  it("picks __tests__ when that pattern dominates", () => {
    const tests = [
      "src/auth/__tests__/login.test.ts",
      "src/orders/__tests__/order.test.ts",
    ];
    const result = extractTestLayout(tests);
    expect(result.layout).toBe("__tests__");
  });

  it("reports mixed when no layout dominates", () => {
    const tests = [
      "src/auth/login.test.ts",
      "tests/orders.test.ts",
      "src/foo/__tests__/foo.test.ts",
    ];
    const result = extractTestLayout(tests);
    // 1 colocated, 1 separate-dir, 1 __tests__ → no layout >= 0.7 share.
    expect(result.layout).toBe("mixed");
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("returns mixed + confidence 0 for an empty test set", () => {
    const result = extractTestLayout([]);
    expect(result.layout).toBe("mixed");
    expect(result.confidence).toBe(0);
  });
});
