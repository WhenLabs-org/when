import { describe, it, expect } from "vitest";
import {
  hashContent,
  stampHash,
  extractStampedHash,
  verifyStampedHash,
  normalizeForHash,
} from "../../src/core/hash.js";
import { HASH_PLACEHOLDER, HASH_MARKER_PREFIX } from "../../src/constants.js";

describe("normalizeForHash", () => {
  it("collapses CRLF to LF", () => {
    expect(normalizeForHash("a\r\nb\r\n")).toBe("a\nb\n");
  });

  it("strips trailing spaces per line", () => {
    expect(normalizeForHash("foo   \nbar\t\n")).toBe("foo\nbar\n");
  });

  it("collapses multiple trailing newlines to one", () => {
    expect(normalizeForHash("hi\n\n\n")).toBe("hi\n");
  });

  it("ensures exactly one trailing newline even when input had none", () => {
    expect(normalizeForHash("hi")).toBe("hi\n");
  });
});

describe("hashContent", () => {
  it("produces a stable 16-char hex digest", () => {
    const h = hashContent("hello");
    expect(h).toMatch(/^[a-f0-9]{16}$/);
    expect(hashContent("hello")).toBe(h);
  });

  it("is whitespace-normalized", () => {
    expect(hashContent("x\r\ny  ")).toBe(hashContent("x\ny"));
  });

  it("distinguishes different content", () => {
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });

  it("strips the hash comment before hashing", () => {
    const withHash = `body\n<!-- ${HASH_MARKER_PREFIX}abc123 -->\n`;
    const withoutHash = "body\n";
    expect(hashContent(withHash)).toBe(hashContent(withoutHash));
  });

  it("is immune to whitespace drift inside the hash comment", () => {
    const a = `body\n<!-- ${HASH_MARKER_PREFIX}abc123 -->\n`;
    const b = `body\n<!--   ${HASH_MARKER_PREFIX}abc123   -->\n`;
    expect(hashContent(a)).toBe(hashContent(b));
  });
});

describe("stampHash / verifyStampedHash round trip", () => {
  it("substitutes the placeholder with the real digest and round-trips", () => {
    const template = `# doc\n<!-- ${HASH_MARKER_PREFIX}${HASH_PLACEHOLDER} -->\n`;
    const stamped = stampHash(template);

    expect(stamped).not.toContain(HASH_PLACEHOLDER);
    const embedded = extractStampedHash(stamped);
    expect(embedded).toMatch(/^[a-f0-9]{16}$/);

    const result = verifyStampedHash(stamped);
    expect(result.matches).toBe(true);
    expect(result.embedded).toBe(embedded);
  });

  it("detects tampering: any edit invalidates the hash", () => {
    const template = `# doc\nhello\n<!-- ${HASH_MARKER_PREFIX}${HASH_PLACEHOLDER} -->\n`;
    const stamped = stampHash(template);

    const tampered = stamped.replace("hello", "hello!");
    const result = verifyStampedHash(tampered);
    expect(result.matches).toBe(false);
    expect(result.embedded).not.toBe(result.expected);
  });

  it("returns embedded=null when no hash marker is present", () => {
    const result = verifyStampedHash("no marker here");
    expect(result.embedded).toBeNull();
    expect(result.matches).toBe(false);
  });

  it("ignores whitespace-only changes (whitespace-normalized)", () => {
    const template = `# doc\nhello\n<!-- ${HASH_MARKER_PREFIX}${HASH_PLACEHOLDER} -->\n`;
    const stamped = stampHash(template);

    const crlf = stamped.replace(/\n/g, "\r\n");
    expect(verifyStampedHash(crlf).matches).toBe(true);
  });

  it("ignores whitespace changes *inside* the hash comment itself", () => {
    const template = `# doc\nhello\n<!-- ${HASH_MARKER_PREFIX}${HASH_PLACEHOLDER} -->\n`;
    const stamped = stampHash(template);

    // Simulate a markdown formatter reflowing whitespace inside the comment.
    const reflowed = stamped.replace(
      new RegExp(`<!--\\s*${HASH_MARKER_PREFIX}([a-f0-9]+)\\s*-->`),
      (_, digest) => `<!--   ${HASH_MARKER_PREFIX}${digest}   -->`,
    );
    expect(verifyStampedHash(reflowed).matches).toBe(true);
  });

  it("throws if the placeholder is missing", () => {
    expect(() => stampHash("no placeholder here")).toThrow(/missing/);
  });

  it("throws if the placeholder appears more than once", () => {
    const doubled =
      `<!-- ${HASH_MARKER_PREFIX}${HASH_PLACEHOLDER} -->\n` +
      `<!-- ${HASH_MARKER_PREFIX}${HASH_PLACEHOLDER} -->`;
    expect(() => stampHash(doubled)).toThrow(/exactly 1/);
  });
});
