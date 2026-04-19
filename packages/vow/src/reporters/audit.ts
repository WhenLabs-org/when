import type { PackageInfo, ScanResult } from '../types.js';
import type { CheckResult, PackageCheckResult } from '../policy/types.js';
import { pkgKey } from '../types.js';

export interface AuditOptions {
  /** Override timestamp (used by tests for deterministic snapshots). */
  now?: Date;
  /** Map of pkgKey -> license text (populated by the command layer from disk). */
  licenseTexts?: Map<string, string>;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugFor(pkg: PackageInfo): string {
  return `pkg-${pkg.ecosystem ?? 'npm'}-${pkg.name}-${pkg.version}`.replace(/[^a-z0-9-]/gi, '-');
}

function categoryColor(category: string): string {
  switch (category) {
    case 'permissive':
    case 'public-domain':
      return '#16a34a';
    case 'weakly-copyleft':
      return '#eab308';
    case 'strongly-copyleft':
    case 'network-copyleft':
      return '#dc2626';
    case 'proprietary':
      return '#7c3aed';
    case 'unknown':
    case 'custom':
      return '#6b7280';
    default:
      return '#6b7280';
  }
}

function actionBadge(action: 'allow' | 'block' | 'warn'): string {
  const color = action === 'block' ? '#dc2626' : action === 'warn' ? '#eab308' : '#16a34a';
  const label = action.toUpperCase();
  return `<span class="badge" style="background:${color}">${label}</span>`;
}

export function toAuditHtml(
  scan: ScanResult,
  check: CheckResult | null,
  options: AuditOptions = {},
): string {
  const now = options.now ?? new Date();
  const texts = options.licenseTexts ?? new Map<string, string>();

  const checkByKey = new Map<string, PackageCheckResult>();
  if (check) {
    for (const item of check.packages) {
      checkByKey.set(pkgKey(item.pkg.name, item.pkg.version), item);
    }
  }

  const sorted = [...scan.packages].sort((a, b) => a.name.localeCompare(b.name));

  const style = `
    :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; }
    body { max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.5; }
    h1 { margin-bottom: 0; }
    h1 + .subtitle { color: #6b7280; margin-top: 0.25rem; }
    h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; margin-top: 2.5rem; }
    h3 { margin-top: 1.5rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    th { background: #f9fafb; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: #f3f4f6; padding: 0 0.2em; border-radius: 3px; }
    .badge { color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.02em; }
    .pkg { border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem 1.25rem; margin: 1rem 0; }
    .pkg.blocked { border-left: 4px solid #dc2626; }
    .pkg.warned { border-left: 4px solid #eab308; }
    .pkg.allowed { border-left: 4px solid #d1d5db; }
    .meta { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.9rem; color: #4b5563; margin-bottom: 0.5rem; }
    .meta span { white-space: nowrap; }
    .category-chip { display: inline-block; padding: 1px 8px; border-radius: 9999px; color: white; font-size: 0.75rem; font-weight: 600; }
    pre.license { background: #f9fafb; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 0.8rem; white-space: pre-wrap; max-height: 400px; overflow: auto; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-top: 1rem; }
    .summary-grid .cell { background: #f9fafb; border-radius: 6px; padding: 0.75rem 1rem; }
    .summary-grid .cell .num { font-size: 1.5rem; font-weight: 700; }
    .summary-grid .cell .lbl { font-size: 0.8rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; }
    @media print {
      body { max-width: none; }
      .pkg { page-break-inside: avoid; }
      h2 { page-break-before: auto; }
      .summary-grid { page-break-inside: avoid; }
    }
  `;

  const rows: string[] = [];
  rows.push(`<!DOCTYPE html>`);
  rows.push(`<html lang="en"><head>`);
  rows.push(`<meta charset="utf-8">`);
  rows.push(`<title>vow audit — ${escapeHtml(scan.project.name)}@${escapeHtml(scan.project.version)}</title>`);
  rows.push(`<style>${style}</style>`);
  rows.push(`</head><body>`);

  rows.push(`<h1>License Compliance Audit</h1>`);
  rows.push(
    `<p class="subtitle"><strong>${escapeHtml(scan.project.name)}@${escapeHtml(scan.project.version)}</strong> — ${escapeHtml(now.toISOString())}</p>`,
  );

  // Summary
  rows.push(`<h2>Summary</h2>`);
  rows.push(`<div class="summary-grid">`);
  rows.push(
    `<div class="cell"><div class="num">${scan.summary.total}</div><div class="lbl">Total packages</div></div>`,
  );
  rows.push(
    `<div class="cell"><div class="num">${scan.ecosystems.length}</div><div class="lbl">Ecosystems (${escapeHtml(scan.ecosystems.join(', ') || '—')})</div></div>`,
  );
  rows.push(
    `<div class="cell"><div class="num">${scan.summary.unknown}</div><div class="lbl">Unknown</div></div>`,
  );
  if (check) {
    rows.push(
      `<div class="cell"><div class="num" style="color:#dc2626">${check.summary.blocked}</div><div class="lbl">Blocked by policy</div></div>`,
    );
  } else {
    rows.push(
      `<div class="cell"><div class="num">${scan.summary.custom}</div><div class="lbl">Custom</div></div>`,
    );
  }
  rows.push(`</div>`);

  if (check) {
    rows.push(`<h3>Policy verdict</h3>`);
    rows.push(`<p>`);
    rows.push(
      check.passed
        ? `<span class="badge" style="background:#16a34a">PASS</span> `
        : `<span class="badge" style="background:#dc2626">FAIL</span> `,
    );
    rows.push(
      `${check.summary.total} packages evaluated against ${check.policy.rules.length} rules: ` +
        `${check.summary.allowed} allowed, ${check.summary.warnings} warned, ${check.summary.blocked} blocked.`,
    );
    rows.push(`</p>`);
  }

  // License breakdown
  rows.push(`<h2>License breakdown</h2>`);
  rows.push(`<table><thead><tr><th>License</th><th>Category</th><th>Count</th></tr></thead><tbody>`);
  const byLicense = [...scan.summary.byLicense.entries()].sort((a, b) => b[1] - a[1]);
  for (const [license, count] of byLicense) {
    const category = categoryForLicense(sorted, license);
    const color = categoryColor(category);
    rows.push(
      `<tr><td><code>${escapeHtml(license)}</code></td>` +
        `<td><span class="category-chip" style="background:${color}">${escapeHtml(category)}</span></td>` +
        `<td>${count}</td></tr>`,
    );
  }
  rows.push(`</tbody></table>`);

  // Per-package detail
  rows.push(`<h2>Packages</h2>`);
  for (const pkg of sorted) {
    const item = checkByKey.get(pkgKey(pkg.name, pkg.version)) ?? null;
    const klass = item?.action === 'block' ? 'blocked' : item?.action === 'warn' ? 'warned' : 'allowed';
    const slug = slugFor(pkg);

    rows.push(`<div class="pkg ${klass}" id="${slug}">`);
    rows.push(`<h3>${escapeHtml(pkg.name)}@${escapeHtml(pkg.version)}</h3>`);

    rows.push(`<div class="meta">`);
    rows.push(`<span><strong>License:</strong> <code>${escapeHtml(pkg.license.spdxExpression ?? 'UNKNOWN')}</code></span>`);
    rows.push(
      `<span><strong>Category:</strong> <span class="category-chip" style="background:${categoryColor(pkg.license.category)}">${escapeHtml(pkg.license.category)}</span></span>`,
    );
    rows.push(`<span><strong>Source:</strong> ${escapeHtml(pkg.license.source)}</span>`);
    rows.push(`<span><strong>Confidence:</strong> ${pkg.license.confidence.toFixed(2)}</span>`);
    rows.push(`<span><strong>Type:</strong> ${escapeHtml(pkg.dependencyType)}</span>`);
    if (pkg.ecosystem) {
      rows.push(`<span><strong>Ecosystem:</strong> ${escapeHtml(pkg.ecosystem)}</span>`);
    }
    rows.push(`</div>`);

    if (item) {
      rows.push(`<p>${actionBadge(item.action)} ${escapeHtml(item.explanation)}</p>`);
      if (item.dependencyPath.length > 0) {
        rows.push(`<p><strong>Required by:</strong> <code>${escapeHtml(item.dependencyPath.join(' → '))}</code></p>`);
      }
    }

    const text = texts.get(pkgKey(pkg.name, pkg.version));
    if (text) {
      rows.push(`<details><summary>License text</summary>`);
      rows.push(`<pre class="license">${escapeHtml(text)}</pre>`);
      rows.push(`</details>`);
    }

    rows.push(`</div>`);
  }

  rows.push(`<p style="color:#6b7280;font-size:0.85rem;margin-top:3rem">Generated by <a href="https://github.com/WhenLabs-org/vow">vow</a>.</p>`);
  rows.push(`</body></html>`);

  return rows.join('\n');
}

function categoryForLicense(packages: PackageInfo[], license: string): string {
  for (const pkg of packages) {
    if ((pkg.license.spdxExpression ?? 'UNKNOWN') === license) {
      return pkg.license.category;
    }
  }
  return 'unknown';
}
