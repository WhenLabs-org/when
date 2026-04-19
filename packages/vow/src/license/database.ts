import spdxLicenseIds from 'spdx-license-ids';
import spdxLicenseList from 'spdx-license-list';

export interface SpdxLicenseEntry {
  id: string;
  name: string;
  isOsiApproved: boolean;
  isFsfLibre: boolean;
  url: string;
}

const licenseIdSet = new Set(spdxLicenseIds.map((id: string) => id.toLowerCase()));

// Common aliases people use → canonical SPDX IDs
const ALIASES: Record<string, string> = {
  'mit license': 'MIT',
  'the mit license': 'MIT',
  'mit/x11': 'MIT',
  'x11': 'MIT',
  'apache 2': 'Apache-2.0',
  'apache 2.0': 'Apache-2.0',
  'apache-2': 'Apache-2.0',
  'apache license 2.0': 'Apache-2.0',
  'apache license, version 2.0': 'Apache-2.0',
  'apache version 2.0': 'Apache-2.0',
  'bsd': 'BSD-2-Clause',
  'bsd license': 'BSD-2-Clause',
  'new bsd': 'BSD-3-Clause',
  'new bsd license': 'BSD-3-Clause',
  'simplified bsd': 'BSD-2-Clause',
  'bsd-like': 'BSD-2-Clause',
  'bsd 2-clause': 'BSD-2-Clause',
  'bsd 3-clause': 'BSD-3-Clause',
  'gpl': 'GPL-3.0-only',
  'gpl v2': 'GPL-2.0-only',
  'gpl v3': 'GPL-3.0-only',
  'gpl-2': 'GPL-2.0-only',
  'gpl-3': 'GPL-3.0-only',
  'gplv2': 'GPL-2.0-only',
  'gplv3': 'GPL-3.0-only',
  'gpl 2.0': 'GPL-2.0-only',
  'gpl 3.0': 'GPL-3.0-only',
  'lgpl': 'LGPL-3.0-only',
  'lgpl v2': 'LGPL-2.0-only',
  'lgpl v2.1': 'LGPL-2.1-only',
  'lgpl v3': 'LGPL-3.0-only',
  'lgplv2': 'LGPL-2.0-only',
  'lgplv2.1': 'LGPL-2.1-only',
  'lgplv3': 'LGPL-3.0-only',
  'agpl': 'AGPL-3.0-only',
  'agpl v3': 'AGPL-3.0-only',
  'agplv3': 'AGPL-3.0-only',
  'agpl 3.0': 'AGPL-3.0-only',
  'mpl 2.0': 'MPL-2.0',
  'mpl-2': 'MPL-2.0',
  'mozilla public license 2.0': 'MPL-2.0',
  'public domain': 'Unlicense',
  'cc0': 'CC0-1.0',
  'isc license': 'ISC',
  'unlicensed': 'UNLICENSED',
  'wtfpl': 'WTFPL',
};

// Build a case-insensitive map from spdx ID → spdx ID
const canonicalById = new Map<string, string>();
for (const id of spdxLicenseIds) {
  canonicalById.set((id as string).toLowerCase(), id as string);
}

export function getAllLicenses(): SpdxLicenseEntry[] {
  return spdxLicenseIds.map((id: string) => {
    const entry = spdxLicenseList[id as keyof typeof spdxLicenseList] as { name: string; osiApproved: boolean; url: string } | undefined;
    return {
      id,
      name: entry?.name ?? id,
      isOsiApproved: entry?.osiApproved ?? false,
      isFsfLibre: false,
      url: entry?.url ?? `https://spdx.org/licenses/${id}.html`,
    };
  });
}

export function getLicenseById(id: string): SpdxLicenseEntry | undefined {
  const canonical = canonicalById.get(id.toLowerCase());
  if (!canonical) return undefined;

  const entry = spdxLicenseList[canonical as keyof typeof spdxLicenseList] as { name: string; osiApproved: boolean; url: string } | undefined;
  return {
    id: canonical,
    name: entry?.name ?? canonical,
    isOsiApproved: entry?.osiApproved ?? false,
    isFsfLibre: false,
    url: entry?.url ?? `https://spdx.org/licenses/${canonical}.html`,
  };
}

export function isValidSpdxId(id: string): boolean {
  return licenseIdSet.has(id.toLowerCase());
}

export function normalizeLicenseId(raw: string): string | null {
  const trimmed = raw.trim();

  // Direct match (case-insensitive)
  const canonical = canonicalById.get(trimmed.toLowerCase());
  if (canonical) return canonical;

  // Alias match
  const alias = ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  return null;
}
