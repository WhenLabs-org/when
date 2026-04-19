import type { ScanResult, Finding } from '@whenlabs/core';

export function formatScanResult(result: ScanResult, format?: 'json' | 'terminal' | 'markdown'): string {
  if (format === 'json') {
    return JSON.stringify(result, replacer, 2);
  }
  const lines: string[] = [];
  const status = result.ok ? 'OK' : 'FAILED';
  const count = result.findings.length;
  lines.push(`${result.tool}: ${status} — ${count} finding${count === 1 ? '' : 's'}`);
  if (count > 0) {
    lines.push('');
    for (const f of result.findings) {
      lines.push(formatFinding(f));
    }
  }
  const s = result.summary;
  if (s.total > 0) {
    lines.push('');
    lines.push(`Summary: ${s.errors} error${s.errors === 1 ? '' : 's'}, ${s.warnings} warning${s.warnings === 1 ? '' : 's'}, ${s.infos} info${s.infos === 1 ? '' : 's'}`);
  }
  return lines.join('\n');
}

function formatFinding(f: Finding): string {
  const parts = [`  [${f.severity}] ${f.ruleId}: ${f.message}`];
  if (f.location) {
    const { file, line, column } = f.location;
    const loc = [file, line, column].filter((v) => v !== undefined).join(':');
    parts.push(`    at ${loc}`);
  }
  if (f.suggestion) {
    parts.push(`    → ${f.suggestion}`);
  }
  return parts.join('\n');
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
}
