import { describe, it, expect } from "vitest";
import { detectStack, stackToConfig, formatStackSummary } from "../../src/detectors/index.js";

const fixtures = new URL("../fixtures", import.meta.url).pathname;

describe("detectStack", () => {
  it("detects full stack for nextjs-app with all 12 fields", async () => {
    const stack = await detectStack(`${fixtures}/nextjs-app`);

    // framework
    expect(stack.framework).not.toBeNull();
    expect(stack.framework!.name).toBe("nextjs");
    expect(stack.framework!.variant).toBe("app-router");

    // language
    expect(stack.language).not.toBeNull();
    expect(stack.language!.name).toBe("typescript");

    // styling
    expect(stack.styling).not.toBeNull();
    expect(stack.styling!.name).toBe("tailwindcss");

    // orm
    expect(stack.orm).not.toBeNull();
    expect(stack.orm!.name).toBe("drizzle");

    // database
    expect(stack.database).not.toBeNull();
    expect(stack.database!.name).toBe("postgres");

    // testing
    expect(stack.testing.length).toBeGreaterThanOrEqual(2);
    const testingNames = stack.testing.map((t) => t.name);
    expect(testingNames).toContain("vitest");
    expect(testingNames).toContain("playwright");

    // linting
    expect(stack.linting.length).toBeGreaterThanOrEqual(2);
    const lintingNames = stack.linting.map((l) => l.name);
    expect(lintingNames).toContain("eslint");
    expect(lintingNames).toContain("prettier");

    // packageManager
    expect(stack.packageManager).not.toBeNull();
    expect(stack.packageManager!.name).toBe("pnpm");

    // monorepo
    expect(stack.monorepo).toBeNull();

    // deployment
    expect(stack.deployment).not.toBeNull();
    expect(stack.deployment!.name).toBe("vercel");

    // auth
    expect(stack.auth).not.toBeNull();
    expect(stack.auth!.name).toBe("nextauth");

    // apiStyle
    expect(stack.apiStyle).not.toBeNull();
    expect(stack.apiStyle!.name).toBe("trpc");
  });
});

describe("stackToConfig", () => {
  it("converts detected stack to config format", async () => {
    const stack = await detectStack(`${fixtures}/nextjs-app`);
    const config = stackToConfig(stack);

    expect(config.framework).toContain("nextjs");
    expect(config.framework).toContain("app-router");
    expect(config.language).toContain("typescript");
    expect(config.styling).toContain("tailwindcss");
    expect(config.orm).toContain("drizzle");
    expect(config.database).toContain("postgres");
    expect(config.testing).toBeInstanceOf(Array);
    expect(config.testing.length).toBeGreaterThanOrEqual(2);
    expect(config.linting).toBeInstanceOf(Array);
    expect(config.linting.length).toBeGreaterThanOrEqual(2);
    expect(config.packageManager).toContain("pnpm");
    expect(config.monorepo).toBeNull();
    expect(config.deployment).toContain("vercel");
    expect(config.auth).toContain("nextauth");
    expect(config.apiStyle).toContain("trpc");
  });
});

describe("formatStackSummary", () => {
  it("produces a readable summary", async () => {
    const stack = await detectStack(`${fixtures}/nextjs-app`);
    const summary = formatStackSummary(stack);

    expect(summary).toContain("Detected Stack");
    expect(summary).toContain("Framework");
    expect(summary).toContain("nextjs");
    expect(summary).toContain("Language");
    expect(summary).toContain("typescript");
  });
});
