import type { StackItem } from "../types.js";
import { parsePackageJson, getDepVersion } from "../utils/parsers.js";
import { hasDep } from "./utils.js";

export async function detectAuth(projectRoot: string): Promise<StackItem | null> {
  const pkg = await parsePackageJson(projectRoot);
  if (!pkg) return null;

  // NextAuth / Auth.js
  if (hasDep(pkg, "next-auth") || hasDep(pkg, "@auth/core")) {
    const version = getDepVersion(pkg, "next-auth") ?? getDepVersion(pkg, "@auth/core");
    return {
      name: "nextauth",
      version,
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Clerk
  if (hasDep(pkg, "@clerk/nextjs") || hasDep(pkg, "@clerk/clerk-react") || hasDep(pkg, "@clerk/backend")) {
    const version = getDepVersion(pkg, "@clerk/nextjs") ?? getDepVersion(pkg, "@clerk/clerk-react") ?? getDepVersion(pkg, "@clerk/backend");
    return {
      name: "clerk",
      version,
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Lucia
  if (hasDep(pkg, "lucia")) {
    return {
      name: "lucia",
      version: getDepVersion(pkg, "lucia"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Better Auth
  if (hasDep(pkg, "better-auth")) {
    return {
      name: "better-auth",
      version: getDepVersion(pkg, "better-auth"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Passport
  if (hasDep(pkg, "passport")) {
    return {
      name: "passport",
      version: getDepVersion(pkg, "passport"),
      variant: null,
      confidence: 0.85,
      detectedFrom: "package.json",
    };
  }

  // Supabase Auth
  if (hasDep(pkg, "@supabase/supabase-js") || hasDep(pkg, "@supabase/auth-helpers-nextjs")) {
    const version = getDepVersion(pkg, "@supabase/supabase-js") ?? getDepVersion(pkg, "@supabase/auth-helpers-nextjs");
    return {
      name: "supabase-auth",
      version,
      variant: null,
      confidence: 0.85,
      detectedFrom: "package.json",
    };
  }

  return null;
}
