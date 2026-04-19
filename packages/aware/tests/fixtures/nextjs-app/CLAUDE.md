# Project: nextjs-app

## Tech Stack
- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **ORM**: Drizzle ORM
- **Database**: postgres
- **Testing**: Vitest + playwright + testing-library
- **Linting**: ESLint + Prettier
- **Package Manager**: pnpm
- **Deployment**: Vercel
- **Auth**: NextAuth.js
- **API Style**: tRPC

## Next.js (App Router)
## Next.js — App Router

### Routing & File Conventions
- Use the `app/` directory; every route folder needs a `page.tsx` to be publicly accessible
- `layout.tsx` wraps child routes and persists across navigations — keep layouts lean
- `loading.tsx` shows instant loading UI via React Suspense; `error.tsx` catches segment errors
- `not-found.tsx` handles 404s at any segment level
- Route groups `(groupName)/` organize without affecting URL paths
- Parallel routes (`@slot`) and intercepting routes `(..)` for modals and complex layouts

### Server vs Client Components
- All components are **React Server Components** by default — they run only on the server
- Add `'use client'` at the top of a file **only** when the component needs interactivity, browser APIs, hooks (`useState`, `useEffect`), or event handlers
- Never import a Server Component into a Client Component — pass it as `children` instead
- Keep Client Components at the leaf of the component tree to minimize client JS bundle

### Data Fetching
- Fetch data directly in Server Components using `async/await` — no `useEffect`
- Use `fetch()` with Next.js extended options: `{ cache: 'force-cache' }` (default, static), `{ cache: 'no-store' }` (dynamic), or `{ next: { revalidate: N } }` for ISR
- Deduplicate requests automatically — same URL + options fetched multiple times in a render tree is called once

### Server Actions
- Mark server-only mutation functions with `'use server'` directive
- Call them from Client Components via `action` prop on forms or programmatically
- Always validate inputs with Zod or similar; never trust client data
- Use `revalidatePath()` / `revalidateTag()` after mutations to bust cache

### API Routes
- Place route handlers in `app/api/*/route.ts` exporting named functions: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
- Return `NextResponse.json()` — set appropriate status codes
- For webhooks or external APIs only; prefer Server Actions for internal mutations

### Navigation & Metadata
- Use `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`) — never import from `next/router`
- Export `metadata` object or `generateMetadata()` async function from `page.tsx`/`layout.tsx` for SEO
- Use `<Link href="...">` for client-side transitions; it prefetches by default

### Assets & Optimization
- Use `next/image` with explicit `width`/`height` or `fill` — never raw `<img>`
- Use `next/font` to self-host fonts with zero layout shift
- Use `next/link` for all internal navigation

## Tailwind CSS
## Tailwind CSS

### Tailwind CSS v3
- Configuration in `tailwind.config.js` / `tailwind.config.ts`
- Extend the theme in `theme.extend` — don't override the base theme unless intentional
- Configure `content` paths to include all files with Tailwind classes for tree-shaking

### Usage Patterns
- Use utility classes directly in markup — avoid writing custom CSS unless absolutely necessary
- Never use `@apply` in component styles — it defeats the purpose of utility-first CSS and increases bundle size
- Compose complex styles with `cn()` or `clsx()` utility for conditional class merging (install `tailwind-merge` + `clsx`)
- Group related utilities with consistent ordering: layout → spacing → sizing → typography → colors → effects

### Responsive & State
- Mobile-first responsive: `sm:`, `md:`, `lg:`, `xl:`, `2xl:` prefixes (min-width breakpoints)
- State variants: `hover:`, `focus:`, `active:`, `disabled:`, `group-hover:`, `peer-checked:`
- Dark mode: use `dark:` variant; configure strategy (`class` or `media`) as needed

### Best Practices
- Extract repeated utility patterns into React components, not CSS classes
- Use design tokens from the theme for consistency — avoid arbitrary values like `w-[137px]` unless truly one-off
- Use `prose` class from `@tailwindcss/typography` for rich text/markdown content

## Drizzle ORM
## Drizzle ORM

### Schema Definition
- Define schemas in dedicated files (e.g., `src/db/schema/users.ts`) and barrel-export from `src/db/schema/index.ts`
- Use the dialect-specific column builders: `pgTable`, `mysqlTable`, or `sqliteTable`
- Define relations with `relations()` for type-safe relational queries
- Use `$inferSelect` and `$inferInsert` to derive TypeScript types from table definitions — never manually duplicate types

### Queries
- Use the query builder API (`db.select().from(users).where(eq(users.id, id))`) for most operations
- Use the relational query API (`db.query.users.findMany({ with: { posts: true } })`) for nested/related data
- Prefer parameterized queries — Drizzle handles SQL injection prevention automatically
- Avoid raw SQL (`sql\`...\``) unless doing something the query builder cannot express (window functions, CTEs)

### Migrations
- Use `drizzle-kit` CLI: `drizzle-kit generate` to create migration files from schema changes
- Run `drizzle-kit migrate` to apply migrations; `drizzle-kit push` for rapid prototyping (no migration files)
- Review generated SQL migrations before applying to production — auto-generated migrations can be destructive
- Keep `drizzle.config.ts` in project root with schema paths and connection config

### Best Practices
- Use transactions (`db.transaction(async (tx) => { ... })`) for multi-statement operations that must be atomic
- Use `.returning()` on insert/update/delete to get affected rows without a separate query
- Use `.$defaultFn()` for generated default values (UUIDs, timestamps)
- Index frequently queried columns — define indexes in schema with `.index()`

## tRPC
## tRPC

### Router Structure
- Define routers with `router()` and organize by domain: `userRouter`, `postRouter`, `commentRouter`
- Merge sub-routers into an `appRouter` with `router({ user: userRouter, post: postRouter })`
- Export the `AppRouter` type for end-to-end type safety on the client

### Procedures
- Use `publicProcedure` for unauthenticated endpoints; create `protectedProcedure` with auth middleware for authenticated ones
- Define input validation with Zod schemas: `.input(z.object({ id: z.string() }))`
- Use `.query()` for read operations (GET-like); `.mutation()` for write operations (POST/PUT/DELETE-like)
- Use `.subscription()` for real-time WebSocket-based data streams

### Middleware & Context
- Create context in `createTRPCContext` — include session, database connection, and request metadata
- Use middleware (`.use()`) for cross-cutting concerns: auth checks, logging, rate limiting
- `protectedProcedure` is typically a middleware that throws `UNAUTHORIZED` if no session exists

### Client Integration
- Use `@trpc/react-query` for React: `trpc.user.getById.useQuery({ id })`
- Use `superjson` as the transformer to support Dates, Maps, Sets, and other non-JSON types
- Use `trpc.useUtils()` to invalidate queries after mutations: `utils.user.getAll.invalidate()`

### Best Practices
- Keep procedures thin — delegate business logic to service functions
- Use Zod `.transform()` and `.refine()` in input schemas for data normalization and custom validation
- Use `TRPCError` with appropriate codes: `NOT_FOUND`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`
- Batch requests are enabled by default — leverage this for parallel data fetching

## NextAuth.js
## NextAuth.js

### NextAuth.js v4
- Configure in `pages/api/auth/[...nextauth].ts` (Pages Router) or `app/api/auth/[...nextauth]/route.ts` (App Router)
- Wrap app with `<SessionProvider>` for client-side session access
- Use `useSession()` hook in Client Components for session data and status
- Use `getServerSession(authOptions)` in `getServerSideProps` or API routes for server-side session checks
- Protect pages with `getServerSideProps` redirect logic or middleware

### Providers & Callbacks
- Configure OAuth providers (Google, GitHub, etc.) and/or Credentials provider in the auth config
- Use `callbacks.jwt` to enrich the JWT token with custom claims (role, userId)
- Use `callbacks.session` to expose token data to the client session object
- Always validate and sanitize data in callbacks — never trust external provider data blindly

### Session & Security
- Use JWT strategy for serverless deployments; database strategy when you need server-side session revocation
- Set `NEXTAUTH_SECRET` environment variable — required for token encryption
- Protect API routes by checking session at the start of every handler; return 401 if unauthenticated
- Use CSRF protection (built-in) — never disable it

## Vitest
## Vitest

### Test Structure
- Name test files as `*.test.ts` or `*.test.tsx`, colocated next to the source file or in a `__tests__/` directory
- Use `describe()` to group related tests; `it()` or `test()` for individual cases
- Use `expect()` assertions — prefer specific matchers (`toEqual`, `toContain`, `toThrow`) over generic `toBeTruthy`

### Mocking
- Use `vi.mock('module')` at the top of the file to mock entire modules — it is hoisted automatically
- Use `vi.spyOn(object, 'method')` to observe calls without replacing implementation
- Use `vi.fn()` for standalone mock functions; assert with `toHaveBeenCalledWith()`
- Reset mocks between tests: `vi.clearAllMocks()` in `beforeEach` or use `mockReset: true` in config

### React Component Testing
- Use `@testing-library/react` with `render()`, `screen`, and `userEvent`
- Query elements by accessible role first: `screen.getByRole('button', { name: /submit/i })`
- Use `userEvent` (not `fireEvent`) for realistic user interactions
- Use `waitFor()` for async state changes; avoid arbitrary timeouts

### Configuration
- Configure in `vitest.config.ts` or the `test` field in `vite.config.ts`
- Use `setupFiles` for global setup (e.g., `@testing-library/jest-dom` matchers)
- Enable coverage with `vitest run --coverage` using `@vitest/coverage-v8` or `@vitest/coverage-istanbul`

### Best Practices
- Keep tests deterministic — mock dates, randomness, and external APIs
- Test behavior, not implementation — assert on output/DOM state, not internal variables
- Use `test.each()` for parameterized tests with multiple input/output combinations

## Playwright
## Playwright (E2E Testing)

### Test Structure
- Place e2e tests in an `e2e/` or `tests/` directory, separate from unit tests
- Use `test.describe()` to group related scenarios; `test()` for individual cases
- Each test should be independent — don't rely on state from previous tests
- Use `test.beforeEach` for common setup (navigation, auth state)

### Locator Strategy
- Prefer accessible locators in this order: `page.getByRole()` > `page.getByText()` > `page.getByLabel()` > `page.getByTestId()`
- Never use CSS/XPath selectors for dynamic content — they break on refactors
- Chain locators for scoping: `page.getByRole('dialog').getByRole('button', { name: 'Confirm' })`
- Use `locator.filter()` to narrow results: `page.getByRole('listitem').filter({ hasText: 'Active' })`

### Page Object Model
- Create page object classes that encapsulate page interactions and locators
- Page objects return data or other page objects — never make assertions inside them
- Keep locators in the page object; tests read as business-level steps

### Assertions & Waiting
- Use `expect(locator).toBeVisible()`, `toHaveText()`, `toHaveValue()` — these auto-wait and retry
- Avoid manual `page.waitForTimeout()` — use auto-waiting assertions or `page.waitForResponse()` for network events
- Use `expect(page).toHaveURL()` to assert navigation; `toHaveTitle()` for page title checks

### Configuration
- Configure in `playwright.config.ts`: base URL, browsers, retries, and parallel workers
- Use `projects` to run tests across Chromium, Firefox, and WebKit
- Use `storageState` for authenticated test contexts — generate auth state in a global setup
- Use `--ui` mode for debugging; `--trace on` to capture trace files for CI failure investigation

## ESLint
## ESLint

### ESLint v8 — Legacy Config
- Configuration in `.eslintrc.json`, `.eslintrc.js`, or `.eslintrc.yml`
- Use `extends` for shared configs; `overrides` for file-specific rules
- Ignore files with `.eslintignore` or the `ignorePatterns` config field

### Usage
- Run `eslint --fix` to auto-fix safe issues (formatting, import order, unused imports)
- Integrate with editor for real-time feedback — fix-on-save is recommended
- Run in CI to block merges with lint errors

### Rules & Discipline
- Never disable a rule without a justifying comment: `// eslint-disable-next-line rule-name -- reason`
- Prefer configuring rules in the config file over scattering inline disables
- Use `error` for rules that indicate bugs; `warn` for stylistic issues being adopted incrementally
- Don't disable `no-explicit-any` — fix the type instead; use `unknown` and narrow

### Best Practices
- Use `typescript-eslint` for TypeScript projects — it provides type-aware rules
- Combine with Prettier (or disable formatting rules) to avoid conflicts
- Keep custom rules minimal — prefer well-maintained shared configs (`eslint-config-next`, `@typescript-eslint/recommended`)

## Prettier
## Prettier

### Role
- Prettier handles **all code formatting** — do not manually format or argue about style
- It is opinionated by design — respect the project's Prettier config without overriding it inline

### Configuration
- Config in `.prettierrc`, `.prettierrc.json`, `prettier.config.js`, or the `prettier` field in `package.json`
- Ignore files with `.prettierignore` — typically ignore generated files, build output, and lock files
- Key options to be aware of: `semi`, `singleQuote`, `trailingComma`, `tabWidth`, `printWidth`

### Usage
- Run `prettier --write .` to format all files; `prettier --check .` in CI to verify formatting
- Enable format-on-save in your editor with Prettier as the default formatter
- Run after code generation (OpenAPI, Prisma) to normalize output formatting

### Integration with Linters
- Use `eslint-config-prettier` to disable ESLint rules that conflict with Prettier
- Never use `eslint-plugin-prettier` (runs Prettier as an ESLint rule) — it's slow; run them separately
- Prettier formats; ESLint catches bugs — keep their responsibilities separate

## Vercel
## Vercel Deployment

### Configuration
- Use `vercel.json` for redirects, rewrites, headers, and function configuration
- Set environment variables in the Vercel dashboard (Settings > Environment Variables) — never hardcode secrets
- Use different env var values per environment: Production, Preview, and Development

### Build & Runtime
- Vercel auto-detects the framework and runs the appropriate build command
- Override build settings in Project Settings or `vercel.json` if auto-detection is wrong
- Use Edge Runtime (`export const runtime = 'edge'`) for latency-sensitive API routes and middleware
- Serverless Functions have a default 10s timeout (60s on Pro) — keep functions fast

### Caching & ISR
- Use ISR (`revalidate: N`) on static pages to rebuild in the background at fixed intervals
- Use on-demand revalidation (`revalidatePath()`, `revalidateTag()`) triggered by webhooks for instant updates
- Static assets are cached on Vercel's CDN automatically — use cache headers for API responses

### Best Practices
- Test locally with `vercel dev` to match production behavior (environment, routing)
- Use Preview Deployments (automatic on PRs) for team review before merging
- Monitor function performance in Vercel Analytics — watch for cold starts and timeouts
- Use `vercel env pull` to sync environment variables to `.env.local` for local development

## Project Structure
| Path | Description |
| --- | --- |
| `src/app/` |  |
---
<!-- Generated by Aware. Edit .aware.json and run `aware sync`. -->