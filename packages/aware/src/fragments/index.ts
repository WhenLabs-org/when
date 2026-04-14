import type {
  DetectedStack,
  AwareConfig,
  Fragment,
  FragmentFunction,
} from "../types.js";

// Framework fragments
import { nextjs15Fragment } from "./framework/nextjs-15.js";
import { nextjsPagesFragment } from "./framework/nextjs-pages.js";
import { viteReactFragment } from "./framework/vite-react.js";
import { expressFragment } from "./framework/express.js";
import { fastifyFragment } from "./framework/fastify.js";
import { rustCliFragment } from "./framework/rust-cli.js";
import { pythonFastapiFragment } from "./framework/python-fastapi.js";

// Styling fragments
import { tailwindcssFragment } from "./styling/tailwindcss.js";
import { styledComponentsFragment } from "./styling/styled-components.js";
import { cssModulesFragment } from "./styling/css-modules.js";

// ORM fragments
import { drizzleFragment } from "./orm/drizzle.js";
import { prismaFragment } from "./orm/prisma.js";
import { sqlalchemyFragment } from "./orm/sqlalchemy.js";

// Testing fragments
import { vitestFragment } from "./testing/vitest.js";
import { jestFragment } from "./testing/jest.js";
import { playwrightFragment } from "./testing/playwright.js";
import { pytestFragment } from "./testing/pytest.js";

// Linting fragments
import { eslintFragment } from "./linting/eslint.js";
import { prettierFragment } from "./linting/prettier.js";
import { biomeFragment } from "./linting/biome.js";

// Deployment fragments
import { vercelFragment } from "./deployment/vercel.js";
import { dockerFragment } from "./deployment/docker.js";
import { netlifyFragment } from "./deployment/netlify.js";

// Auth fragments
import { nextauthFragment } from "./auth/nextauth.js";
import { clerkFragment } from "./auth/clerk.js";

// API fragments
import { trpcFragment } from "./api/trpc.js";
import { graphqlFragment } from "./api/graphql.js";
import { restFragment } from "./api/rest.js";

const allFragmentFunctions: FragmentFunction[] = [
  // Framework (10-19)
  nextjs15Fragment,
  nextjsPagesFragment,
  viteReactFragment,
  expressFragment,
  fastifyFragment,
  rustCliFragment,
  pythonFastapiFragment,

  // Styling (20-29)
  tailwindcssFragment,
  styledComponentsFragment,
  cssModulesFragment,

  // ORM (30-39)
  drizzleFragment,
  prismaFragment,
  sqlalchemyFragment,

  // API (40-49)
  trpcFragment,
  graphqlFragment,
  restFragment,

  // Auth (50-59)
  nextauthFragment,
  clerkFragment,

  // Testing (60-69)
  vitestFragment,
  jestFragment,
  playwrightFragment,
  pytestFragment,

  // Linting (70-79)
  eslintFragment,
  prettierFragment,
  biomeFragment,

  // Deployment (80-89)
  vercelFragment,
  netlifyFragment,
  dockerFragment,
];

export function resolveFragments(
  stack: DetectedStack,
  config: AwareConfig,
): Fragment[] {
  const fragments: Fragment[] = [];

  for (const fn of allFragmentFunctions) {
    const result = fn(stack, config);
    if (result !== null) {
      fragments.push(result);
    }
  }

  fragments.sort((a, b) => a.priority - b.priority);

  return fragments;
}
