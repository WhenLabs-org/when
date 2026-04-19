import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface LedgerEntry {
  id: string;
  hash: string;
  appliedAt: string;
}

export interface Ledger {
  applied: LedgerEntry[];
}

export function readLedger(path: string): Ledger {
  if (!existsSync(path)) return { applied: [] };
  const content = readFileSync(path, "utf-8");
  try {
    return JSON.parse(content) as Ledger;
  } catch {
    return { applied: [] };
  }
}

export function writeLedger(path: string, ledger: Ledger): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2), "utf-8");
}

export function hasApplied(ledger: Ledger, id: string, hash: string): boolean {
  return ledger.applied.some((e) => e.id === id && e.hash === hash);
}

export function recordApplied(
  ledger: Ledger,
  entry: LedgerEntry,
): Ledger {
  return { applied: [...ledger.applied, entry] };
}
