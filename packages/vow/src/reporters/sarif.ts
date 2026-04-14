import type { CheckResult } from '../policy/types.js';

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
    };
  }>;
}

interface SarifReport {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: Array<{
          id: string;
          shortDescription: { text: string };
          defaultConfiguration: { level: string };
        }>;
      };
    };
    results: SarifResult[];
  }>;
}

export function toSARIF(result: CheckResult): SarifReport {
  const rules = result.policy.rules.map(rule => ({
    id: rule.id,
    shortDescription: { text: rule.originalText || `${rule.action} rule` },
    defaultConfiguration: {
      level: rule.action === 'block' ? 'error' : rule.action === 'warn' ? 'warning' : 'note',
    },
  }));

  const results: SarifResult[] = [];

  for (const item of result.blocked) {
    const license = item.pkg.license.spdxExpression ?? 'UNKNOWN';
    results.push({
      ruleId: item.matchedRule?.id ?? 'default',
      level: 'error',
      message: {
        text: `${item.pkg.name}@${item.pkg.version} uses ${license} license. ${item.explanation}`,
      },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: 'package-lock.json' },
        },
      }],
    });
  }

  for (const item of result.warnings) {
    const license = item.pkg.license.spdxExpression ?? 'UNKNOWN';
    results.push({
      ruleId: item.matchedRule?.id ?? 'default',
      level: 'warning',
      message: {
        text: `${item.pkg.name}@${item.pkg.version} uses ${license} license. ${item.explanation}`,
      },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: 'package-lock.json' },
        },
      }],
    });
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'Vow',
          version: '0.1.0',
          informationUri: 'https://github.com/vow-cli/vow',
          rules,
        },
      },
      results,
    }],
  };
}
