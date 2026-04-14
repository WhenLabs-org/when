import type { StackItem } from "../types.js";

export function matchesStack(item: StackItem | null, name: string): boolean {
  if (!item) return false;
  return item.name.toLowerCase() === name.toLowerCase();
}

export function matchesAny(items: StackItem[], name: string): boolean {
  return items.some(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
}
