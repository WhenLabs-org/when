import { describe, it, expect } from "vitest";
import { extractLayout } from "../../src/conventions/layout.js";

describe("extractLayout", () => {
  it("detects route-based (Next.js app/)", () => {
    const files = [
      "src/app/layout.tsx",
      "src/app/page.tsx",
      "src/app/(marketing)/about/page.tsx",
      "src/components/Button.tsx",
    ];
    const result = extractLayout(files);
    expect(result.pattern).toBe("route-based");
    expect(result.evidence).toContain("app/");
  });

  it("detects feature-sliced", () => {
    const files = [
      "src/features/auth/ui.tsx",
      "src/features/orders/api.ts",
      "src/entities/user/model.ts",
      "src/shared/lib/fetch.ts",
    ];
    const result = extractLayout(files);
    expect(result.pattern).toBe("feature-sliced");
    expect(result.evidence.some((e) => e.startsWith("features"))).toBe(true);
  });

  it("detects atomic-design", () => {
    const files = [
      "src/atoms/Button.tsx",
      "src/molecules/Card.tsx",
      "src/organisms/Header.tsx",
    ];
    const result = extractLayout(files);
    expect(result.pattern).toBe("atomic-design");
  });

  it("mixed when evidence is split between patterns", () => {
    const files = [
      "src/app/page.tsx",           // route-based +2
      "src/atoms/Button.tsx",       // atomic-design +2
      "src/molecules/Card.tsx",     // atomic-design +2
    ];
    const result = extractLayout(files);
    // atomic-design leads with 4/6 ≈ 0.67 — below threshold, reported as mixed.
    expect(result.pattern).toBe("mixed");
  });

  it("returns mixed + confidence 0 when nothing matches", () => {
    const files = ["main.go", "pkg/foo.go"];
    const result = extractLayout(files);
    expect(result.pattern).toBe("mixed");
    expect(result.confidence).toBe(0);
  });
});
