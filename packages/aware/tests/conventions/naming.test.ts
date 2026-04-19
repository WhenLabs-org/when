import { describe, it, expect } from "vitest";
import {
  classifyBasename,
  extractNaming,
} from "../../src/conventions/naming.js";

describe("classifyBasename", () => {
  it("recognizes kebab-case", () => {
    expect(classifyBasename("user-profile.ts")).toBe("kebab-case");
    expect(classifyBasename("api-client.tsx")).toBe("kebab-case");
  });

  it("recognizes snake_case", () => {
    expect(classifyBasename("user_profile.py")).toBe("snake_case");
  });

  it("recognizes multi-token PascalCase", () => {
    expect(classifyBasename("UserProfile.tsx")).toBe("PascalCase");
    expect(classifyBasename("LoginForm.tsx")).toBe("PascalCase");
  });

  it("returns null for single-token capitalized names (ambiguous)", () => {
    // `Button.tsx` in a components/ dir is PascalCase, but `Index.tsx`
    // in a pages/ route is just a capitalized filename — not a
    // convention. The general classifier stays conservative and the
    // caller (extractNaming) uses the component-bucket classifier for
    // files in components/ui dirs where that interpretation is safe.
    expect(classifyBasename("Button.tsx")).toBeNull();
    expect(classifyBasename("Index.tsx")).toBeNull();
  });

  it("recognizes camelCase", () => {
    expect(classifyBasename("userProfile.ts")).toBe("camelCase");
  });

  it("returns null for ambiguous single-word lowercase names", () => {
    // `utils` could be camelCase or kebab-case with one segment — we
    // don't want to bias toward either.
    expect(classifyBasename("utils.ts")).toBeNull();
    expect(classifyBasename("index.ts")).toBeNull();
  });

  it("strips secondary extensions (foo.test.ts → foo)", () => {
    expect(classifyBasename("user-profile.test.ts")).toBe("kebab-case");
    expect(classifyBasename("UserProfile.test.tsx")).toBe("PascalCase");
  });
});

describe("extractNaming", () => {
  it("picks kebab-case when kebab dominates", () => {
    const files = [
      "src/user-profile.ts",
      "src/api-client.ts",
      "src/auth-service.ts",
      "src/user-handler.ts",
      "src/utils.ts", // ambiguous — skipped
    ];
    const result = extractNaming(files);
    expect(result.files).toBe("kebab-case");
    expect(result.confidence).toBe(1);
    expect(result.sampleSize).toBe(4);
  });

  it("reports confidence as the winning-share fraction", () => {
    const files = [
      "src/user-profile.ts",
      "src/user-service.ts",
      "src/userProfile.ts",
    ];
    const result = extractNaming(files);
    // 2 kebab, 1 camel → confidence 2/3
    expect(result.files).toBe("kebab-case");
    expect(result.confidence).toBeCloseTo(2 / 3, 2);
  });

  it("separates component naming from general naming", () => {
    const files = [
      "src/components/Button.tsx",
      "src/components/UserCard.tsx",
      "src/components/LoginForm.tsx",
      "src/lib/api-client.ts",
      "src/lib/auth-service.ts",
      "src/lib/user-helper.ts",
    ];
    const result = extractNaming(files);
    expect(result.files).toBe("kebab-case");
    expect(result.components).toBe("PascalCase");
  });

  it("returns mixed + confidence 0 when no file classifies", () => {
    const result = extractNaming(["src/index.ts", "src/utils.ts"]);
    expect(result.files).toBe("mixed");
    expect(result.confidence).toBe(0);
  });
});
