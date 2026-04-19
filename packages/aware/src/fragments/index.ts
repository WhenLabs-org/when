import type {
  DetectedStack,
  AwareConfig,
  Fragment,
  FragmentFunction,
  FragmentModule,
} from "../types.js";
import { FragmentRegistry, defaultRegistry } from "./registry.js";

// Framework fragments — version-aware modules for Next.js App Router.
// Each module declares `appliesTo.versionRange` and the registry picks
// whichever one matches the detected version; they share the same output
// id (`nextjs-app-router`) so downstream consumers see a single fragment.
import { nextjs14Module } from "./framework/nextjs-14.js";
import { nextjs15Module } from "./framework/nextjs-15.js";
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
import { goFragment } from "./framework/go.js";

// Styling fragments — Tailwind splits by major. v3 used a JS config file;
// v4 is CSS-native. Wrong-version guidance tells the AI tool to edit
// files that don't exist.
import { tailwind3Module } from "./styling/tailwind-3.js";
import { tailwind4Module } from "./styling/tailwind-4.js";
import { styledComponentsFragment } from "./styling/styled-components.js";
import { cssModulesFragment } from "./styling/css-modules.js";

// ORM fragments
import { drizzleFragment } from "./orm/drizzle.js";
import { prismaFragment } from "./orm/prisma.js";
import { sqlalchemyFragment } from "./orm/sqlalchemy.js";
import { typeormFragment } from "./orm/typeorm.js";
import { mongooseFragment } from "./orm/mongoose.js";
import { kyselyFragment } from "./orm/kysely.js";
import { sequelizeFragment } from "./orm/sequelize.js";

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
import { passportFragment } from "./auth/passport.js";

// API fragments
import { trpcFragment } from "./api/trpc.js";
import { graphqlFragment } from "./api/graphql.js";
import { restFragment } from "./api/rest.js";

// State management fragments
import { zustandFragment } from "./state-management/zustand.js";
import { reduxToolkitFragment } from "./state-management/redux-toolkit.js";
import { jotaiFragment } from "./state-management/jotai.js";
import { xstateFragment } from "./state-management/xstate.js";
import { piniaFragment } from "./state-management/pinia.js";
import { mobxFragment } from "./state-management/mobx.js";
import { valtioFragment } from "./state-management/valtio.js";
import { recoilFragment } from "./state-management/recoil.js";

// CI/CD fragments
import { githubActionsFragment } from "./cicd/github-actions.js";
import { gitlabCiFragment } from "./cicd/gitlab-ci.js";
import { circleciFragment } from "./cicd/circleci.js";
import { jenkinsFragment } from "./cicd/jenkins.js";

// Phase 2 version-aware fragments ship as full FragmentModule manifests.
// Legacy bare functions continue to register via the compat shim below.
const coreModules: FragmentModule[] = [
  nextjs14Module,
  nextjs15Module,
  tailwind3Module,
  tailwind4Module,
];

const allFragmentFunctions: FragmentFunction[] = [
  // Framework (10-19)
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
  goFragment,

  // Styling (20-29) — tailwindcssFragment migrated to tailwind-3/4 manifests above.
  styledComponentsFragment,
  cssModulesFragment,

  // ORM (30-39)
  drizzleFragment,
  prismaFragment,
  sqlalchemyFragment,
  typeormFragment,
  mongooseFragment,
  kyselyFragment,
  sequelizeFragment,

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
  passportFragment,

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
  piniaFragment,
  mobxFragment,
  valtioFragment,
  recoilFragment,

  // Deployment (80-89)
  vercelFragment,
  netlifyFragment,
  dockerFragment,
  flyFragment,
  railwayFragment,

  // CI/CD (86-89)
  githubActionsFragment,
  gitlabCiFragment,
  circleciFragment,
  jenkinsFragment,
];

// Core fragments register in two waves:
//   1. Full FragmentModule manifests (Phase 2+): Next.js by major,
//      Tailwind by major. The registry gates them via `appliesTo` so
//      only the matching version runs.
//   2. Legacy bare `FragmentFunction` fragments (pre-Phase-2): each
//      wraps itself, carrying id/category/priority inside the returned
//      Fragment. Dup-id protection still applies at resolve time.
let coreRegistered = false;
function registerCoreFragments(registry: FragmentRegistry): void {
  for (const mod of coreModules) {
    registry.register(mod);
  }
  for (const fn of allFragmentFunctions) {
    registry.registerLegacy(fn);
  }
}

function ensureCoreRegistered(): void {
  if (coreRegistered) return;
  registerCoreFragments(defaultRegistry);
  coreRegistered = true;
}

/** Register a fragment module (core or plugin) with the default registry. */
export function registerFragmentModule(module: FragmentModule): void {
  ensureCoreRegistered();
  defaultRegistry.register(module);
}

export function resolveFragments(
  stack: DetectedStack,
  config: AwareConfig,
): Fragment[] {
  ensureCoreRegistered();
  return defaultRegistry.resolve(stack, config);
}

// Registry internals (FragmentRegistry, defaultRegistry) intentionally
// not re-exported at module boundary — Phase 5 will settle the plugin
// API surface. Tests import directly from "./registry.js".
