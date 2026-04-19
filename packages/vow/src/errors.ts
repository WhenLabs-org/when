/**
 * Structured error catalog. Every exit-non-zero code path in vow should map
 * to a stable `VOW-EXXXX` identifier so CI logs, user docs, and bug reports
 * share a vocabulary. Add new codes at the bottom — codes are never reused.
 *
 * Exit code conventions:
 *   1  — expected domain failure that user opted into gating on (policy
 *        violation, diff regression). Scripted CI pipelines catch exit 1.
 *   2  — operational error (misconfig, missing file, bad flag). Usually
 *        actionable by fixing the environment, not the code.
 */

export interface VowErrorSpec {
  message: string;
  exitCode: 1 | 2;
}

export const VOW_ERRORS = {
  // Domain failures (exit 1 — CI gate behavior)
  'VOW-E1001': {
    message: 'Policy violations detected',
    exitCode: 1,
  },
  'VOW-E1002': {
    message: 'License diff detected changes above the fail-on threshold',
    exitCode: 1,
  },

  // Policy configuration
  'VOW-E2001': {
    message: 'No policy file found (.vow.json or .vow.yml). Run `vow init` to create one.',
    exitCode: 2,
  },
  'VOW-E2002': {
    message: 'Policy file must contain a "policy" field with text',
    exitCode: 2,
  },
  'VOW-E2003': {
    message: 'Could not read policy file',
    exitCode: 2,
  },
  'VOW-E2004': {
    message: 'Anthropic API key required. Set ANTHROPIC_API_KEY or pass --api-key. Get a key at https://console.anthropic.com/settings/keys.',
    exitCode: 2,
  },
  'VOW-E2005': {
    message: '--offline requires a matching policy.lock.json. Run `vow policy compile` once and commit the lockfile.',
    exitCode: 2,
  },

  // Diff
  'VOW-E2101': {
    message: 'Could not read baseline scan JSON',
    exitCode: 2,
  },

  // CLI arguments
  'VOW-E2201': {
    message: 'Invalid --format argument',
    exitCode: 2,
  },

  // Output
  'VOW-E2301': {
    message: 'Could not write output file',
    exitCode: 2,
  },
} as const satisfies Record<string, VowErrorSpec>;

export type VowErrorCode = keyof typeof VOW_ERRORS;

export class VowError extends Error {
  readonly code: VowErrorCode;
  readonly exitCode: 1 | 2;
  readonly details: string | undefined;

  constructor(code: VowErrorCode, details?: string) {
    const spec = VOW_ERRORS[code];
    super(details ? `${spec.message}: ${details}` : spec.message);
    this.name = 'VowError';
    this.code = code;
    this.exitCode = spec.exitCode;
    this.details = details;
  }
}

export function vowError(code: VowErrorCode, details?: string): VowError {
  return new VowError(code, details);
}

/**
 * Format a VowError for terminal output. Use this in the top-level CLI
 * handler so every structured failure is printed the same way.
 */
export function formatVowError(err: VowError): string {
  const spec = VOW_ERRORS[err.code];
  const lines = [`vow: ${err.code} ${spec.message}`];
  if (err.details) lines.push(`  ${err.details}`);
  return lines.join('\n');
}
