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

### Server vs Client Components

### Data Fetching

### Server Actions

### API Routes

### Navigation & Metadata

### Assets & Optimization

## Tailwind CSS
## Tailwind CSS

### Tailwind CSS v3
- Configuration in `tailwind.config.js` / `tailwind.config.ts`
- Extend the theme in `theme.extend` — don't override the base theme unless intentional
- Configure `content` paths to include all files with Tailwind classes for tree-shaking

### Usage Patterns
- Use utility classes directly in markup — avoid writing custom CSS unless absolutely necessary
- Never use `@apply` in component styles — it defeats the purpose of utility-first CSS and increases bundle size

### Responsive & State

### Best Practices

## Drizzle ORM
## Drizzle ORM

### Schema Definition
- Define schemas in dedicated files (e.g., `src/db/schema/users.ts`) and barrel-export from `src/db/schema/index.ts`
- Use the dialect-specific column builders: `pgTable`, `mysqlTable`, or `sqliteTable`
- Define relations with `relations()` for type-safe relational queries
- Use `$inferSelect` and `$inferInsert` to derive TypeScript types from table definitions — never manually duplicate types

### Queries
- Use the query builder API (`db.select().from(users).where(eq(users.id, id))`) for most operations

### Migrations

### Best Practices

## tRPC
## tRPC

### Router Structure
- Define routers with `router()` and organize by domain: `userRouter`, `postRouter`, `commentRouter`
- Merge sub-routers into an `appRouter` with `router({ user: userRouter, post: postRouter })`
- Export the `AppRouter` type for end-to-end type safety on the client

### Procedures
- Use `publicProcedure` for unauthenticated endpoints; create `protectedProcedure` with auth middleware for authenticated ones
- Define input validation with Zod schemas: `.input(z.object({ id: z.string() }))`

### Middleware & Context

### Client Integration

### Best Practices

## NextAuth.js
## NextAuth.js

### NextAuth.js v4
- Configure in `pages/api/auth/[...nextauth].ts` (Pages Router) or `app/api/auth/[...nextauth]/route.ts` (App Router)
- Wrap app with `<SessionProvider>` for client-side session access
- Use `useSession()` hook in Client Components for session data and status
- Use `getServerSession(authOptions)` in `getServerSideProps` or API routes for server-side session checks
- Protect pages with `getServerSideProps` redirect logic or middleware

### Providers & Callbacks

### Session & Security

## Vitest
## Vitest

### Test Structure
- Name test files as `*.test.ts` or `*.test.tsx`, colocated next to the source file or in a `__tests__/` directory
- Use `describe()` to group related tests; `it()` or `test()` for individual cases
- Use `expect()` assertions — prefer specific matchers (`toEqual`, `toContain`, `toThrow`) over generic `toBeTruthy`

### Mocking
- Use `vi.mock('module')` at the top of the file to mock entire modules — it is hoisted automatically
- Use `vi.spyOn(object, 'method')` to observe calls without replacing implementation

### React Component Testing

### Configuration

### Best Practices

## Playwright
## Playwright (E2E Testing)

### Test Structure
- Place e2e tests in an `e2e/` or `tests/` directory, separate from unit tests
- Use `test.describe()` to group related scenarios; `test()` for individual cases
- Each test should be independent — don't rely on state from previous tests
- Use `test.beforeEach` for common setup (navigation, auth state)

### Locator Strategy
- Prefer accessible locators in this order: `page.getByRole()` > `page.getByText()` > `page.getByLabel()` > `page.getByTestId()`

### Page Object Model

### Assertions & Waiting

### Configuration

## ESLint
## ESLint

### ESLint v8 — Legacy Config
- Configuration in `.eslintrc.json`, `.eslintrc.js`, or `.eslintrc.yml`
- Use `extends` for shared configs; `overrides` for file-specific rules
- Ignore files with `.eslintignore` or the `ignorePatterns` config field

### Usage
- Run `eslint --fix` to auto-fix safe issues (formatting, import order, unused imports)
- Integrate with editor for real-time feedback — fix-on-save is recommended

### Rules & Discipline

### Best Practices

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

### Integration with Linters

## Vercel
## Vercel Deployment

### Configuration
- Use `vercel.json` for redirects, rewrites, headers, and function configuration
- Set environment variables in the Vercel dashboard (Settings > Environment Variables) — never hardcode secrets
- Use different env var values per environment: Production, Preview, and Development

### Build & Runtime
- Vercel auto-detects the framework and runs the appropriate build command
- Override build settings in Project Settings or `vercel.json` if auto-detection is wrong

### Caching & ISR

### Best Practices

## Project Structure
| Path | Description |
| --- | --- |
| `src/app/` |  |
---
<!-- Generated by Aware. Edit .aware.json and run `aware sync`. -->