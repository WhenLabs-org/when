import parse from 'spdx-expression-parse';
import { isValidSpdxId } from './database.js';

export interface ParsedSpdxExpression {
  raw: string;
  licenses: string[];
  isCompound: boolean;
  ast: unknown;
}

// Non-SPDX values commonly found in package.json
const NON_SPDX_PATTERNS = [
  /^see licen[cs]e/i,
  /^https?:\/\//,
  /^file:/i,
  /^UNLICENSED$/i,
  /^NONE$/i,
  /^custom/i,
  /^proprietary/i,
  /^commercial/i,
];

export function isSpdxExpression(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;

  for (const pattern of NON_SPDX_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  try {
    parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function collectLicenseIds(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];

  const n = node as Record<string, unknown>;

  if ('license' in n && typeof n['license'] === 'string') {
    return [n['license']];
  }

  const ids: string[] = [];
  if ('left' in n) ids.push(...collectLicenseIds(n['left']));
  if ('right' in n) ids.push(...collectLicenseIds(n['right']));
  return ids;
}

export function parseSpdxExpression(expr: string): ParsedSpdxExpression | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  try {
    const ast = parse(trimmed);
    const licenses = collectLicenseIds(ast);
    return {
      raw: trimmed,
      licenses,
      isCompound: licenses.length > 1,
      ast,
    };
  } catch {
    return null;
  }
}

export function extractLicenseIds(expr: string): string[] {
  const parsed = parseSpdxExpression(expr);
  return parsed ? parsed.licenses : [];
}

export function satisfies(expr: string, allowedLicenses: string[]): boolean {
  const parsed = parseSpdxExpression(expr);
  if (!parsed) return false;

  // For simple expressions, check direct membership
  if (!parsed.isCompound) {
    const id = parsed.licenses[0];
    return id !== undefined && allowedLicenses.some(
      allowed => allowed.toLowerCase() === id.toLowerCase()
    );
  }

  // For compound expressions, check against the AST
  return checkSatisfaction(parsed.ast, new Set(allowedLicenses.map(l => l.toLowerCase())));
}

function checkSatisfaction(node: unknown, allowed: Set<string>): boolean {
  if (!node || typeof node !== 'object') return false;

  const n = node as Record<string, unknown>;

  if ('license' in n && typeof n['license'] === 'string') {
    return allowed.has(n['license'].toLowerCase());
  }

  if ('conjunction' in n) {
    const left = checkSatisfaction(n['left'], allowed);
    const right = checkSatisfaction(n['right'], allowed);

    if (n['conjunction'] === 'or') {
      // OR: at least one branch must be satisfied
      return left || right;
    } else {
      // AND: both branches must be satisfied
      return left && right;
    }
  }

  return false;
}

export { isValidSpdxId };
