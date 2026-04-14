import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function viteReactFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (
    !matchesStack(stack.framework, "vite-react") &&
    !matchesStack(stack.framework, "vite")
  )
    return null;

  return {
    id: "vite-react",
    category: "framework",
    title: "Vite + React",
    priority: 12,
    content: `## Vite + React

### Dev Server & Build
- Vite uses native ESM in development — no bundling step, instant HMR
- Use \`vite.config.ts\` for all project configuration; plugin order matters
- Build output goes to \`dist/\` — Rollup-based production bundling with tree-shaking
- Use \`vite preview\` to locally test production builds before deploying

### Environment Variables
- Only variables prefixed with \`VITE_\` are exposed to client code (\`import.meta.env.VITE_API_URL\`)
- Never put secrets in \`VITE_\` variables — they are embedded in the client bundle
- Use \`.env\`, \`.env.local\`, \`.env.production\` files; \`.local\` files are git-ignored

### React Patterns
- Use functional components exclusively — no class components
- Use \`React.lazy()\` + \`<Suspense>\` for route-level code splitting
- Colocate component, styles, and tests in the same directory
- Prefer controlled components; lift state only when needed

### HMR & Fast Refresh
- React Fast Refresh preserves component state during edits
- Only default-exported components get fast refresh — avoid anonymous exports
- If HMR breaks, check for side effects at module scope

### Path Aliases
- Configure \`resolve.alias\` in \`vite.config.ts\` (e.g., \`@/\` → \`./src/\`)
- Mirror alias config in \`tsconfig.json\` paths for editor support

### Optimization
- Use dynamic \`import()\` for heavy libraries (charts, editors) to avoid large initial bundles
- Analyze bundle with \`rollup-plugin-visualizer\`
- Use \`optimizeDeps.include\` for CJS dependencies that need pre-bundling`,
  };
}
