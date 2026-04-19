import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LicenseResult, DependencyType, LicenseCategory } from '../types.js';
import { normalizeLicenseId } from '../license/database.js';
import { parseSpdxExpression, isSpdxExpression } from '../license/spdx.js';
import { getLicenseCategory } from '../license/categories.js';
import { classifyLicenseText } from '../license/classifier.js';

export interface ResolverOptions {
  projectPath: string;
  includeDevDependencies: boolean;
  depth?: number;
}

export interface ResolvedPackage {
  name: string;
  version: string;
  license: LicenseResult;
  dependencyType: DependencyType;
  dependencies: string[];
  path?: string;
  rawLicense?: string;
}

const LICENSE_FILE_NAMES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt',
  'LICENSE.MIT', 'LICENSE.BSD', 'LICENSE.APACHE', 'LICENSE.APACHE-2.0',
  'LICENSE-MIT', 'LICENSE-BSD', 'LICENSE-APACHE', 'LICENSE-APACHE-2.0',
  'LICENSE-MIT.md', 'LICENSE-APACHE.md', 'LICENSE-APACHE-2.0.md',
  'LICENSE-MIT.txt', 'LICENSE-APACHE.txt', 'LICENSE-APACHE-2.0.txt',
  'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'COPYING', 'COPYING.md', 'COPYING.txt', 'COPYING.LESSER',
  'license', 'license.md', 'license.txt',
  'license-mit', 'license-apache', 'license-apache-2.0',
  'license-mit.md', 'license-apache.md', 'license-apache-2.0.md',
  'licence', 'licence.md', 'licence.txt',
  'copying', 'copying.md', 'copying.txt',
  'License', 'License.md', 'License.txt',
];

export abstract class BaseResolver {
  constructor(protected options: ResolverOptions) {}

  abstract detect(): Promise<boolean>;
  abstract resolve(): Promise<ResolvedPackage[]>;
  abstract get ecosystem(): string;

  protected async readAndClassifyLicenseFile(dirPath: string): Promise<LicenseResult | null> {
    const results = await this.readAndClassifyAllLicenseFiles(dirPath);
    if (results.length === 0) return null;
    if (results.length === 1) return results[0]!;
    return combineLicenseResults(results);
  }

  protected async readAndClassifyAllLicenseFiles(
    dirPath: string,
  ): Promise<LicenseResult[]> {
    let files: string[];
    try {
      files = await readdir(dirPath);
    } catch {
      return [];
    }

    const results: LicenseResult[] = [];
    const seenSpdx = new Set<string>();
    let fallbackCustom: LicenseResult | null = null;

    for (const candidate of LICENSE_FILE_NAMES) {
      if (!files.includes(candidate)) continue;

      const filePath = path.join(dirPath, candidate);
      let text: string;
      try {
        const content = await readFile(filePath, 'utf-8');
        text = content.slice(0, 50_000);
      } catch {
        continue;
      }

      const classified = classifyLicenseText(text);
      if (classified) {
        const key = classified.spdxId.toLowerCase();
        if (seenSpdx.has(key)) continue;
        seenSpdx.add(key);
        results.push({
          spdxExpression: classified.spdxId,
          source: 'license-file',
          confidence: classified.confidence,
          category: getLicenseCategory(classified.spdxId),
          licenseFilePath: filePath,
        });
        continue;
      }

      // Remember the first unclassifiable file so we can fall back to "custom"
      // only when NO file classified. A mix of one classified + one custom is
      // reported as the classified one (not as compound).
      if (!fallbackCustom) {
        fallbackCustom = {
          spdxExpression: null,
          source: 'license-file',
          confidence: 0,
          category: 'custom',
          licenseFilePath: filePath,
          licenseText: text.slice(0, 500),
        };
      }
    }

    if (results.length > 0) return results;
    return fallbackCustom ? [fallbackCustom] : [];
  }

  protected async resolveLicense(
    _packageName: string,
    _version: string,
    packageDir?: string,
    metadata?: Record<string, unknown>,
  ): Promise<LicenseResult> {
    // Step 1: Package metadata
    if (metadata) {
      const metaLicense = this.extractLicenseFromMetadata(metadata);
      if (metaLicense) return metaLicense;
    }

    // Step 2 & 3: LICENSE file detection + classification
    if (packageDir) {
      const fileLicense = await this.readAndClassifyLicenseFile(packageDir);
      if (fileLicense && fileLicense.spdxExpression) return fileLicense;
    }

    // Step 4: Registry API fallback (npm specific, handled in subclass)
    // Step 5: AI fallback (future/paid feature)

    // Could not determine license
    return {
      spdxExpression: null,
      source: 'none',
      confidence: 0,
      category: 'unknown',
    };
  }

  protected extractLicenseFromMetadata(metadata: Record<string, unknown>): LicenseResult | null {
    // Handle string license field
    let rawLicense: string | null = null;

    if (typeof metadata['license'] === 'string') {
      rawLicense = metadata['license'];
    }
    // Handle deprecated {type, url} object format
    else if (
      metadata['license'] &&
      typeof metadata['license'] === 'object' &&
      'type' in (metadata['license'] as Record<string, unknown>)
    ) {
      rawLicense = (metadata['license'] as { type: string }).type;
    }
    // Handle deprecated licenses array
    else if (Array.isArray(metadata['licenses'])) {
      const first = metadata['licenses'][0] as { type?: string } | undefined;
      if (first?.type) {
        rawLicense = first.type;
      }
    }

    if (!rawLicense) return null;

    // Handle UNLICENSED
    if (rawLicense.toUpperCase() === 'UNLICENSED') {
      return {
        spdxExpression: 'UNLICENSED',
        source: 'package-metadata',
        confidence: 1,
        category: 'proprietary',
      };
    }

    // Handle "SEE LICENSE IN <filename>"
    if (/^see licen[cs]e in/i.test(rawLicense)) {
      // This will be handled by LICENSE file detection
      return null;
    }

    // Try to parse as SPDX expression
    if (isSpdxExpression(rawLicense)) {
      const parsed = parseSpdxExpression(rawLicense);
      if (parsed) {
        const category: LicenseCategory = parsed.licenses.length === 1
          ? getLicenseCategory(parsed.licenses[0]!)
          : 'unknown';

        return {
          spdxExpression: rawLicense,
          source: 'package-metadata',
          confidence: 1,
          category,
        };
      }
    }

    // Try to normalize to a known SPDX ID
    const normalized = normalizeLicenseId(rawLicense);
    if (normalized) {
      return {
        spdxExpression: normalized,
        source: 'package-metadata',
        confidence: 0.9,
        category: getLicenseCategory(normalized),
      };
    }

    // Unknown license string
    return {
      spdxExpression: null,
      source: 'package-metadata',
      confidence: 0,
      category: 'custom',
      licenseText: rawLicense,
    };
  }
}

function combineLicenseResults(results: LicenseResult[]): LicenseResult {
  const ids = results
    .map((r) => r.spdxExpression)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  if (ids.length === 0) return results[0]!;
  if (ids.length === 1) return results[0]!;

  // Dual/multi-license: combine as SPDX OR expression.
  // Uniqueness is already enforced by the caller via seenSpdx, but re-dedupe
  // defensively in case this helper is called directly.
  const unique = Array.from(new Set(ids));
  const expression = unique.length === 1 ? unique[0]! : `(${unique.join(' OR ')})`;

  // Category: if all branches share one, keep it; otherwise 'unknown' (user's
  // choice — matches how extractLicenseFromMetadata handles compound SPDX).
  const categories = new Set(results.map((r) => r.category));
  const category = categories.size === 1 ? [...categories][0]! : 'unknown';

  const confidence = Math.min(...results.map((r) => r.confidence));

  return {
    spdxExpression: expression,
    source: 'license-file',
    confidence,
    category,
  };
}
