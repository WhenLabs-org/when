import Anthropic from '@anthropic-ai/sdk';
import type { ParsedPolicy, ParsedPolicyRule, PolicyAction, PolicyCondition } from './types.js';
import { createPolicyCache, hashPolicyText } from './cache.js';

const SYSTEM_PROMPT = `You are a license policy parser for a software dependency auditing tool. Your job is to convert plain-English license policies into structured rules.

Given policy text, produce a JSON array of rules. Each rule has:
- "action": "allow" | "block" | "warn"
- "condition": { "type": "license-id" | "license-category" | "license-pattern" | "package-name" | "any", "values": [...], "negate": false }
- "scope": optional array of "production" | "dev" | "peer" | "optional" — omit if rule applies to all
- "originalText": the sentence from the policy this rule came from
- "notes": optional clarification

IMPORTANT RULES FOR PARSING:
1. "GPL" without further specification means ALL GPL variants: GPL-2.0-only, GPL-3.0-only, GPL-2.0-or-later, GPL-3.0-or-later, GPL-2.0, GPL-3.0.
2. "BSD" without specification means all BSD variants: BSD-2-Clause, BSD-3-Clause, BSD-4-Clause, 0BSD.
3. "copyleft" as a category means all copyleft licenses (GPL, AGPL, LGPL, MPL, EPL, CDDL, etc.)
4. "permissive" as a category means MIT, Apache-2.0, BSD variants, ISC, Unlicense, etc.
5. Use "license-id" type for specific SPDX IDs, "license-category" for categories like "permissive" or "copyleft", "license-pattern" for substring matching (e.g., "GPL" matches all GPL variants).
6. If the policy says "any license not explicitly mentioned", create a catch-all rule with type "any" and negate: false.
7. "devDependencies" or "test dependencies" maps to scope: ["dev"]. "runtime dependencies" or "production dependencies" maps to scope: ["production"].
8. Always include a default rule as the LAST rule for anything not explicitly covered. Default should be "warn" unless the policy implies otherwise.
9. Order rules from most specific to most general. The evaluation engine uses first-match-wins.

Valid SPDX license IDs include: MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, GPL-2.0-only, GPL-3.0-only, AGPL-3.0-only, LGPL-2.1-only, LGPL-3.0-only, MPL-2.0, Unlicense, CC0-1.0, 0BSD, etc.

Valid category values: "permissive", "weakly-copyleft", "strongly-copyleft", "network-copyleft", "public-domain", "proprietary", "unknown", "custom"

Respond with ONLY valid JSON, no markdown fences, no explanation. The JSON must be an array of rule objects.`;

export interface ParsePolicyOptions {
  apiKey?: string;
  forceRefresh?: boolean;
  cacheDir?: string;
}

export async function parsePolicy(
  policyText: string,
  options: ParsePolicyOptions = {},
): Promise<ParsedPolicy> {
  const cache = createPolicyCache(options.cacheDir);

  // Check cache
  if (!options.forceRefresh) {
    const cached = cache.get(policyText);
    if (cached) return cached;
  }

  // Resolve API key
  const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'Anthropic API key required for policy parsing.\n' +
      'Set the ANTHROPIC_API_KEY environment variable or pass --api-key.\n' +
      'Get a key at https://console.anthropic.com/settings/keys',
    );
  }

  const client = new Anthropic({ apiKey });

  const userMessage = `Policy text:\n---\n${policyText}\n---`;

  let rules: ParsedPolicyRule[];

  // First attempt
  try {
    rules = await callAndParse(client, userMessage);
  } catch (firstError) {
    // Retry once with correction
    try {
      rules = await callAndParse(client, userMessage + '\n\nIMPORTANT: Your response must be ONLY valid JSON. No markdown, no explanation.');
    } catch {
      throw firstError;
    }
  }

  // Assign IDs and validate
  const validatedRules = rules.map((rule, i) => ({
    ...rule,
    id: `rule-${i + 1}`,
  }));

  // Determine default action from the last rule if it's a catch-all
  let defaultAction: PolicyAction = 'warn';
  const lastRule = validatedRules[validatedRules.length - 1];
  if (lastRule && lastRule.condition.type === 'any' && !lastRule.condition.negate) {
    defaultAction = lastRule.action;
  }

  const parsed: ParsedPolicy = {
    rules: validatedRules,
    sourceHash: hashPolicyText(policyText),
    parsedAt: new Date().toISOString(),
    defaultAction,
  };

  // Cache result
  cache.set(policyText, parsed);

  return parsed;
}

async function callAndParse(
  client: Anthropic,
  userMessage: string,
): Promise<ParsedPolicyRule[]> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    temperature: 0,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON:\n${text.slice(0, 500)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Expected Claude to return a JSON array of rules');
  }

  return (parsed as unknown[]).map(validateRule);
}

function validateRule(raw: unknown): ParsedPolicyRule {
  const obj = raw as Record<string, unknown>;

  const action = obj['action'] as string;
  if (!['allow', 'block', 'warn'].includes(action)) {
    throw new Error(`Invalid action: ${action}`);
  }

  const condition = obj['condition'] as Record<string, unknown>;
  if (!condition || typeof condition !== 'object') {
    throw new Error('Missing condition in rule');
  }

  const condType = condition['type'] as string;
  if (!['license-id', 'license-category', 'license-pattern', 'package-name', 'any'].includes(condType)) {
    throw new Error(`Invalid condition type: ${condType}`);
  }

  const values = (condition['values'] as string[]) ?? [];

  const validatedCondition: PolicyCondition = {
    type: condType as PolicyCondition['type'],
    values,
    pattern: condition['pattern'] as string | undefined,
    negate: (condition['negate'] as boolean) ?? false,
  };

  const scope = obj['scope'] as string[] | undefined;

  return {
    id: '',
    action: action as PolicyAction,
    condition: validatedCondition,
    scope: scope as ParsedPolicyRule['scope'],
    originalText: (obj['originalText'] as string) ?? '',
    notes: obj['notes'] as string | undefined,
  };
}

export function buildPolicyPrompt(policyText: string): string {
  return `${SYSTEM_PROMPT}\n\nPolicy text:\n---\n${policyText}\n---`;
}
