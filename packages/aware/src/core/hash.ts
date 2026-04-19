import * as crypto from "node:crypto";
import { HASH_MARKER_PREFIX, HASH_PLACEHOLDER } from "../constants.js";

// Matches the stamped-or-placeholder hash comment regardless of internal
// whitespace. Used to strip the comment before hashing so that editing
// whitespace *inside* the comment itself never invalidates the digest.
const HASH_COMMENT_RE = /<!--[ \t]*aware:hash:[^>]*?-->/g;
const HASH_DIGEST_RE = /<!--\s*aware:hash:([a-f0-9]+)\s*-->/;

/**
 * Normalize content before hashing so trivial whitespace differences — CRLF
 * vs LF, trailing spaces, blank lines at EOF — don't register as drift.
 *
 * Contract: normalize produces a canonical form with (a) LF line endings,
 * (b) no trailing whitespace on any line, (c) exactly one trailing newline.
 */
export function normalizeForHash(content: string): string {
  const lineNormalized = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
  return lineNormalized + "\n";
}

/**
 * Strip the hash comment from content so stamping and verifying both hash
 * the same shape. Without this, any whitespace drift *inside* the hash
 * comment (from a markdown formatter, editor, or accidental edit) would
 * produce a false "tampered" verdict even though content is unchanged.
 */
function stripHashComment(content: string): string {
  return content.replace(HASH_COMMENT_RE, "");
}

/** Hash arbitrary content (normalized, hash-comment stripped). */
export function hashContent(content: string): string {
  const stripped = stripHashComment(content);
  const normalized = normalizeForHash(stripped);
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Compute the hash of a file that contains its own hash slot.
 *
 * Callers assemble the file with `HASH_PLACEHOLDER` where the real hash
 * will live. We hash the file with the hash comment stripped (see
 * `stripHashComment`) — this makes the stamp self-consistent and immune
 * to whitespace drift inside the comment itself.
 *
 * Throws if the placeholder is absent, or if it occurs more than once:
 * the stamp protocol assumes exactly one hash slot per file.
 */
export function stampHash(contentWithPlaceholder: string): string {
  const occurrences = countOccurrences(contentWithPlaceholder, HASH_PLACEHOLDER);
  if (occurrences === 0) {
    throw new Error(
      `stampHash: content is missing the \`${HASH_PLACEHOLDER}\` slot. ` +
        `Did you forget \`footerWithPlaceholder()\`?`,
    );
  }
  if (occurrences > 1) {
    throw new Error(
      `stampHash: content has ${occurrences} hash placeholders; expected exactly 1.`,
    );
  }
  const digest = hashContent(contentWithPlaceholder);
  return contentWithPlaceholder.replace(HASH_PLACEHOLDER, digest);
}

/** Extract the embedded hash from generated-file content, or null if absent. */
export function extractStampedHash(content: string): string | null {
  const match = content.match(HASH_DIGEST_RE);
  return match?.[1] ?? null;
}

/**
 * Recompute what the stamped hash *should* be for the given file content.
 * Phase 1's drift detector uses this: embedded !== expected means the
 * file was modified outside `aware sync`.
 */
export function verifyStampedHash(content: string): {
  embedded: string | null;
  expected: string | null;
  matches: boolean;
} {
  const embedded = extractStampedHash(content);
  if (!embedded) return { embedded: null, expected: null, matches: false };
  const expected = hashContent(content);
  return { embedded, expected, matches: embedded === expected };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

// Re-exported for the public surface.
export { HASH_MARKER_PREFIX, HASH_PLACEHOLDER };
