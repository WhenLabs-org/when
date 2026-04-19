import type { ScanResult } from '../types.js';
import { scanResultToJSON } from '../types.js';
import type { CheckResult } from '../policy/types.js';

export function toJSON(result: ScanResult | CheckResult, pretty?: boolean): string {
  const shouldPretty = pretty ?? (process.stdout.isTTY ?? false);

  if ('summary' in result && 'graph' in result && result.graph instanceof Map) {
    // ScanResult
    return JSON.stringify(scanResultToJSON(result as ScanResult), null, shouldPretty ? 2 : undefined);
  }

  // CheckResult — no Maps to convert
  return JSON.stringify(result, null, shouldPretty ? 2 : undefined);
}
