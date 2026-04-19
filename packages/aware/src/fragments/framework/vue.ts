import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function vueFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "vue") && !matchesStack(stack.framework, "vite-vue")) return null;

  return {
    id: "vue",
    category: "framework",
    title: "Vue",
    priority: 12,
    content: `## Vue

### Composition API
- Use \`<script setup>\` for all components — it's the recommended syntax
- Use \`ref()\` for primitive reactive state and \`reactive()\` for objects
- Use \`computed()\` for derived values — they auto-track dependencies
- Use \`watch()\` and \`watchEffect()\` for side effects on reactive changes

### Components
- Use single-file components (\`.vue\` files) with \`<script setup>\`, \`<template>\`, \`<style scoped>\`
- Define props with \`defineProps<{ ... }>()\` and emits with \`defineEmits<{ ... }>()\`
- Use \`v-model\` with \`defineModel()\` for two-way binding
- Use slots (\`<slot>\`) for component composition — named slots for complex layouts

### Patterns
- Use composables (\`use*.ts\`) to extract and reuse stateful logic across components
- Use \`provide()\`/\`inject()\` for dependency injection across component trees
- Use Vue Router for navigation — \`useRouter()\` and \`useRoute()\` composables
- Use \`<Suspense>\` for async component loading and \`<Teleport>\` for portal rendering

### Style
- Use \`<style scoped>\` to scope CSS to the component
- Use \`:deep()\` selector to target child component styles from a scoped parent
- Prefer CSS custom properties or utility classes over deep style overrides`,
  };
}
