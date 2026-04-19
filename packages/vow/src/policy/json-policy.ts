import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ParsedPolicy, ParsedPolicyRule, PolicyAction } from './types.js';
import { hashPolicyText } from './cache.js';

export interface JsonPolicyFile {
  allow?: string[];
  deny?: string[];
  warn?: string[];
  require_attribution?: boolean;
  /**
   * Flag any resolved license whose confidence is below this threshold (0..1).
   * Compiles to a first-match-wins rule at the TOP of the rule list, so it
   * applies before license-id checks. Action: 'warn' by default, or 'block'
   * if `min_confidence_action` is set to "block".
   */
  min_confidence?: number;
  min_confidence_action?: 'warn' | 'block';
}

export async function loadJsonPolicy(projectPath: string): Promise<{ policy: ParsedPolicy; raw: JsonPolicyFile } | null> {
  const filePath = path.join(projectPath, '.vow.json');
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  const raw = JSON.parse(content) as JsonPolicyFile;
  const policy = jsonPolicyToParsedPolicy(raw);
  return { policy, raw };
}

export function jsonPolicyToParsedPolicy(config: JsonPolicyFile): ParsedPolicy {
  const rules: ParsedPolicyRule[] = [];
  let ruleIndex = 0;

  // Confidence gate (first-match-wins, so placed at the top)
  if (typeof config.min_confidence === 'number') {
    const action: PolicyAction = config.min_confidence_action === 'block' ? 'block' : 'warn';
    rules.push({
      id: `json-rule-${++ruleIndex}`,
      action,
      condition: {
        type: 'confidence',
        values: [],
        threshold: config.min_confidence,
      },
      originalText: `${action === 'block' ? 'Block' : 'Warn'} when license confidence < ${config.min_confidence}`,
    });
  }

  // Allow rules
  if (config.allow) {
    for (const licenseId of config.allow) {
      rules.push({
        id: `json-rule-${++ruleIndex}`,
        action: 'allow',
        condition: {
          type: 'license-id',
          values: [licenseId],
        },
        originalText: `Allow ${licenseId}`,
      });
    }
  }

  // Warn rules
  if (config.warn) {
    for (const licenseId of config.warn) {
      rules.push({
        id: `json-rule-${++ruleIndex}`,
        action: 'warn',
        condition: {
          type: 'license-id',
          values: [licenseId],
        },
        originalText: `Warn on ${licenseId}`,
      });
    }
  }

  // Deny rules
  if (config.deny) {
    for (const licenseId of config.deny) {
      rules.push({
        id: `json-rule-${++ruleIndex}`,
        action: 'block',
        condition: {
          type: 'license-id',
          values: [licenseId],
        },
        originalText: `Deny ${licenseId}`,
      });
    }
  }

  // If allow list is specified, anything not in allow/warn is denied (catch-all)
  const defaultAction: PolicyAction = config.allow ? 'block' : 'warn';

  rules.push({
    id: `json-rule-${++ruleIndex}`,
    action: defaultAction,
    condition: {
      type: 'any',
      values: [],
    },
    originalText: config.allow
      ? 'Any license not explicitly allowed or warned is denied'
      : 'Default: warn on unrecognized licenses',
  });

  const sourceText = JSON.stringify(config);

  return {
    rules,
    sourceHash: hashPolicyText(sourceText),
    parsedAt: new Date().toISOString(),
    defaultAction,
  };
}
