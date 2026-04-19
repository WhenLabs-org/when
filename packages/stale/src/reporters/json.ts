import type { Reporter, DriftReport } from '../types.js';

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) return Array.from(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

export class JsonReporter implements Reporter {
  format = 'json' as const;

  render(report: DriftReport): string {
    return JSON.stringify(report, replacer, 2);
  }
}
