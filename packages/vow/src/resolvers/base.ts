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
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.MIT', 'LICENSE.BSD',
  'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'COPYING', 'COPYING.md', 'COPYING.txt',
  'license', 'license.md', 'license.txt',
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
    let files: string[];
    try {
      files = await readdir(dirPath);
    } catch {
      return null;
    }

    for (const candidate of LICENSE_FILE_NAMES) {
      if (files.includes(candidate)) {
        try {
          const filePath = path.join(dirPath, candidate);
          const content = await readFile(filePath, 'utf-8');
          // Limit to 50KB
          const text = content.slice(0, 50_000);

          const result = classifyLicenseText(text);
          if (result) {
            return {
              spdxExpression: result.spdxId,
              source: 'license-file',
              confidence: result.confidence,
              category: getLicenseCategory(result.spdxId),
              licenseFilePath: filePath,
            };
          }

          // Could not classify — return as custom
          return {
            spdxExpression: null,
            source: 'license-file',
            confidence: 0,
            category: 'custom',
            licenseFilePath: filePath,
            licenseText: text.slice(0, 500),
          };
        } catch {
          continue;
        }
      }
    }

    return null;
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
