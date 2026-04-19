import type { LicenseCategory } from '../types.js';

const LICENSE_CATEGORIES: Record<string, LicenseCategory> = {
  // Permissive
  'MIT': 'permissive',
  '0BSD': 'permissive',
  'ISC': 'permissive',
  'BSD-2-Clause': 'permissive',
  'BSD-3-Clause': 'permissive',
  'BSD-4-Clause': 'permissive',
  'Apache-2.0': 'permissive',
  'Unlicense': 'permissive',
  'CC0-1.0': 'permissive',
  'WTFPL': 'permissive',
  'Zlib': 'permissive',
  'BSL-1.0': 'permissive',
  'MIT-0': 'permissive',
  'BlueOak-1.0.0': 'permissive',
  'CC-BY-3.0': 'permissive',
  'CC-BY-4.0': 'permissive',
  'Artistic-2.0': 'permissive',
  'Python-2.0': 'permissive',
  'PSF-2.0': 'permissive',
  'X11': 'permissive',
  'curl': 'permissive',
  'JSON': 'permissive',

  // Public domain
  'CC-PDDC': 'public-domain',
  'PDDL-1.0': 'public-domain',

  // Weakly copyleft
  'LGPL-2.0-only': 'weakly-copyleft',
  'LGPL-2.0-or-later': 'weakly-copyleft',
  'LGPL-2.1-only': 'weakly-copyleft',
  'LGPL-2.1-or-later': 'weakly-copyleft',
  'LGPL-3.0-only': 'weakly-copyleft',
  'LGPL-3.0-or-later': 'weakly-copyleft',
  'LGPL-2.0': 'weakly-copyleft',
  'LGPL-2.1': 'weakly-copyleft',
  'LGPL-3.0': 'weakly-copyleft',
  'MPL-2.0': 'weakly-copyleft',
  'EPL-1.0': 'weakly-copyleft',
  'EPL-2.0': 'weakly-copyleft',
  'CDDL-1.0': 'weakly-copyleft',
  'CDDL-1.1': 'weakly-copyleft',
  'CPL-1.0': 'weakly-copyleft',
  'IPL-1.0': 'weakly-copyleft',
  'OSL-3.0': 'weakly-copyleft',
  'EUPL-1.1': 'weakly-copyleft',
  'EUPL-1.2': 'weakly-copyleft',
  'CC-BY-SA-3.0': 'weakly-copyleft',
  'CC-BY-SA-4.0': 'weakly-copyleft',

  // Strongly copyleft
  'GPL-2.0-only': 'strongly-copyleft',
  'GPL-2.0-or-later': 'strongly-copyleft',
  'GPL-3.0-only': 'strongly-copyleft',
  'GPL-3.0-or-later': 'strongly-copyleft',
  'GPL-2.0': 'strongly-copyleft',
  'GPL-3.0': 'strongly-copyleft',
  'CECILL-2.1': 'strongly-copyleft',
  'SSPL-1.0': 'strongly-copyleft',

  // Network copyleft
  'AGPL-1.0-only': 'network-copyleft',
  'AGPL-1.0-or-later': 'network-copyleft',
  'AGPL-3.0-only': 'network-copyleft',
  'AGPL-3.0-or-later': 'network-copyleft',
  'AGPL-3.0': 'network-copyleft',
  'OSL-1.0': 'network-copyleft',

  // Proprietary
  'UNLICENSED': 'proprietary',
};

export function getLicenseCategory(spdxId: string): LicenseCategory {
  const direct = LICENSE_CATEGORIES[spdxId];
  if (direct) return direct;

  const upper = spdxId.toUpperCase();

  if (upper === 'UNLICENSED') return 'proprietary';

  // Heuristic fallbacks based on ID patterns
  if (upper.startsWith('AGPL')) return 'network-copyleft';
  if (upper.startsWith('LGPL')) return 'weakly-copyleft';
  if (upper.startsWith('GPL')) return 'strongly-copyleft';
  if (upper.includes('GPL')) return 'strongly-copyleft';
  if (upper.startsWith('MPL') || upper.startsWith('EPL') || upper.startsWith('CDDL')) return 'weakly-copyleft';
  if (upper.startsWith('CC-BY-SA')) return 'weakly-copyleft';
  if (upper.startsWith('CC-BY')) return 'permissive';
  if (upper.startsWith('CC0') || upper.startsWith('CC-PDDC')) return 'public-domain';
  if (upper.startsWith('BSD') || upper.includes('MIT') || upper.includes('ISC')) return 'permissive';
  if (upper.startsWith('APACHE')) return 'permissive';

  return 'unknown';
}

export function isPermissive(spdxId: string): boolean {
  return getLicenseCategory(spdxId) === 'permissive';
}

export function isCopyleft(spdxId: string): boolean {
  const cat = getLicenseCategory(spdxId);
  return cat === 'weakly-copyleft' || cat === 'strongly-copyleft' || cat === 'network-copyleft';
}

export function isStronglyCopyleft(spdxId: string): boolean {
  const cat = getLicenseCategory(spdxId);
  return cat === 'strongly-copyleft' || cat === 'network-copyleft';
}

export { LICENSE_CATEGORIES };

// I asked vow to check my dependencies. Turns out my project has
// commitment issues — 12 packages with no license at all. They refuse to make a vow.
