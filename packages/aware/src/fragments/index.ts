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
import { remixFragment } from "./framework/remix.js";
import { astroFragment } from "./framework/astro.js";
import { sveltekitFragment } from "./framework/sveltekit.js";
import { djangoFragment } from "./framework/django.js";
import { flaskFragment } from "./framework/flask.js";
import { honoFragment } from "./framework/hono.js";
import { angularFragment } from "./framework/angular.js";
import { nestjsFragment } from "./framework/nestjs.js";
import { vueFragment } from "./framework/vue.js";
import { goWebFragment } from "./framework/go-web.js";

// Styling fragments
import { tailwindcssFragment } from "./styling/tailwindcss.js";
import { styledComponentsFragment } from "./styling/styled-components.js";
import { cssModulesFragment } from "./styling/css-modules.js";

// ORM fragments
import { drizzleFragment } from "./orm/drizzle.js";
import { prismaFragment } from "./orm/prisma.js";
import { sqlalchemyFragment } from "./orm/sqlalchemy.js";
import { typeormFragment } from "./orm/typeorm.js";
import { mongooseFragment } from "./orm/mongoose.js";
import { kyselyFragment } from "./orm/kysely.js";

// Testing fragments
import { vitestFragment } from "./testing/vitest.js";
import { jestFragment } from "./testing/jest.js";
import { playwrightFragment } from "./testing/playwright.js";
import { pytestFragment } from "./testing/pytest.js";
import { cypressFragment } from "./testing/cypress.js";

// Linting fragments
import { eslintFragment } from "./linting/eslint.js";
import { prettierFragment } from "./linting/prettier.js";
import { biomeFragment } from "./linting/biome.js";

// Deployment fragments
import { vercelFragment } from "./deployment/vercel.js";
import { dockerFragment } from "./deployment/docker.js";
import { netlifyFragment } from "./deployment/netlify.js";
import { flyFragment } from "./deployment/fly.js";
import { railwayFragment } from "./deployment/railway.js";

// Auth fragments
import { nextauthFragment } from "./auth/nextauth.js";
import { clerkFragment } from "./auth/clerk.js";
import { luciaFragment } from "./auth/lucia.js";
import { betterAuthFragment } from "./auth/better-auth.js";
import { supabaseAuthFragment } from "./auth/supabase-auth.js";

// API fragments
import { trpcFragment } from "./api/trpc.js";
import { graphqlFragment } from "./api/graphql.js";
import { restFragment } from "./api/rest.js";

// State management fragments
import { zustandFragment } from "./state-management/zustand.js";
import { reduxToolkitFragment } from "./state-management/redux-toolkit.js";
import { jotaiFragment } from "./state-management/jotai.js";
import { xstateFragment } from "./state-management/xstate.js";

// CI/CD fragments
import { githubActionsFragment } from "./cicd/github-actions.js";
import { gitlabCiFragment } from "./cicd/gitlab-ci.js";

const allFragmentFunctions: FragmentFunction[] = [
  // Framework (10-19)
  nextjs15Fragment,
  nextjsPagesFragment,
  viteReactFragment,
  expressFragment,
  fastifyFragment,
  rustCliFragment,
  pythonFastapiFragment,
  remixFragment,
  astroFragment,
  sveltekitFragment,
  djangoFragment,
  flaskFragment,
  honoFragment,
  angularFragment,
  nestjsFragment,
  vueFragment,
  goWebFragment,

  // Styling (20-29)
  tailwindcssFragment,
  styledComponentsFragment,
  cssModulesFragment,

  // ORM (30-39)
  drizzleFragment,
  prismaFragment,
  sqlalchemyFragment,
  typeormFragment,
  mongooseFragment,
  kyselyFragment,

  // API (40-49)
  trpcFragment,
  graphqlFragment,
  restFragment,

  // Auth (50-59)
  nextauthFragment,
  clerkFragment,
  luciaFragment,
  betterAuthFragment,
  supabaseAuthFragment,

  // Testing (60-69)
  vitestFragment,
  jestFragment,
  playwrightFragment,
  pytestFragment,
  cypressFragment,

  // Linting (70-79)
  eslintFragment,
  prettierFragment,
  biomeFragment,

  // State Management (43-47)
  zustandFragment,
  reduxToolkitFragment,
  jotaiFragment,
  xstateFragment,

  // Deployment (80-89)
  vercelFragment,
  netlifyFragment,
  dockerFragment,
  flyFragment,
  railwayFragment,

  // CI/CD (86-89)
  githubActionsFragment,
  gitlabCiFragment,
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
