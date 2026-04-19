import type { ScanResult } from '../types.js';

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCSV(result: ScanResult): string {
  const headers = ['Package', 'Version', 'License', 'Category', 'Source', 'Confidence', 'DependencyType', 'Depth'];
  const lines: string[] = [headers.join(',')];

  // Sort packages alphabetically
  const sorted = [...result.packages].sort((a, b) => a.name.localeCompare(b.name));

  for (const pkg of sorted) {
    const node = result.graph.get(`${pkg.name}@${pkg.version}`);
    const depth = node?.depth ?? -1;

    const row = [
      escapeCSV(pkg.name),
      escapeCSV(pkg.version),
      escapeCSV(pkg.license.spdxExpression ?? 'UNKNOWN'),
      escapeCSV(pkg.license.category),
      escapeCSV(pkg.license.source),
      pkg.license.confidence.toString(),
      escapeCSV(pkg.dependencyType),
      depth === Infinity ? 'N/A' : depth.toString(),
    ];

    lines.push(row.join(','));
  }

  return lines.join('\n') + '\n';
}
