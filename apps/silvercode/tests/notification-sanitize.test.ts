/**
 * Tests for `notification-sanitize.ts` (Layer 2 of the notification-context safety
 * stack — see `apps/silvercode/docs/channels.md`).
 *
 * Properties:
 *
 *   - **Idempotence**: `sanitize(sanitize(x)) === sanitize(x)` for all x.
 *   - **Meaning preservation for benign content**: ASCII text without
 *     role-prefix patterns or ANSI passes through unchanged.
 *   - **Pattern-break for adversarial content**: every role-prefix marker
 *     in the corpus gets its colon replaced with the sentinel.
 *   - **Size-bound**: payload over `MAX_NOTIFICATION_BYTES` is truncated with
 *     a visible marker; under the cap is preserved.
 *   - **ANSI / control strip**: ANSI escapes and C0 controls are removed
 *     while \n + \t are preserved.
 *   - **NFC normalization**: combining-mark variants don't bypass the
 *     pattern-break.
 *
 * Adversarial corpus loaded from `tests/eval/fixtures/role-prefix-corpus.b64`
 * (binary blob, `.recall-ignore`) — trigger tokens stay out of the
 * recall/grep surface. See § 9 of the design doc.
 */

import { describe, expect, test } from "vitest"
import {
  MAX_NOTIFICATION_BYTES,
  ROLE_PREFIX_SENTINEL,
  containsRolePrefix,
  sanitizeNotification,
} from "../src/notification-sanitize.ts"
import { loadRolePrefixCorpus } from "./eval/load-corpus.ts"

const corpus = loadRolePrefixCorpus()

describe("notification-sanitize — Layer 2", () => {
  describe("idempotence", () => {
    test("benign ASCII passes through idempotently", () => {
      const inputs = ["hello world", "", "multi\nline\ntext", "with\ttabs", "unicode café", "emoji 🚀"]
      for (const x of inputs) {
        const once = sanitizeNotification(x)
        const twice = sanitizeNotification(once)
        expect(twice).toBe(once)
      }
    })

    test("idempotent over the entire adversarial corpus", () => {
      for (const payload of corpus) {
        const once = sanitizeNotification(payload)
        const twice = sanitizeNotification(once)
        expect(twice).toBe(once)
      }
    })

    test("idempotent for inputs at the size boundary", () => {
      const input = "x".repeat(MAX_NOTIFICATION_BYTES + 1000)
      const once = sanitizeNotification(input)
      const twice = sanitizeNotification(once)
      expect(twice).toBe(once)
    })
  })

  describe("meaning preservation for benign content", () => {
    test("plain ASCII passes through unchanged", () => {
      expect(sanitizeNotification("hello world")).toBe("hello world")
      expect(sanitizeNotification("a multi\nline\nstring")).toBe("a multi\nline\nstring")
      expect(sanitizeNotification("tabs\tand\tspaces")).toBe("tabs\tand\tspaces")
    })

    test("empty string returns empty string", () => {
      expect(sanitizeNotification("")).toBe("")
    })

    test("benign markdown passes through", () => {
      const md = "# heading\n\n- item 1\n- item 2\n\n```code block```\n"
      expect(sanitizeNotification(md)).toBe(md)
    })

    test("URLs and code identifiers pass through", () => {
      const s = "see https://example.com/path?q=1 — call foo.bar(baz, qux) for details"
      expect(sanitizeNotification(s)).toBe(s)
    })

    test("non-role 'word:' patterns pass through", () => {
      // Words ending with colon that aren't role tokens must not be touched.
      expect(sanitizeNotification("note: this is fine")).toBe("note: this is fine")
      expect(sanitizeNotification("Author: someone")).toBe("Author: someone")
      expect(sanitizeNotification("URL: https://x.com")).toBe("URL: https://x.com")
      expect(sanitizeNotification("Hello: world")).toBe("Hello: world")
    })

    test("role-token-LIKE substrings mid-line pass through (only line-start triggers)", () => {
      // The regex anchors to line start, so a role token in the middle of
      // a sentence isn't pattern-broken — meaning preservation.
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110)
      const s = `prefix text ${ROLE_H}: still mid-line so leave alone`
      // Mid-line role token preserved
      expect(sanitizeNotification(s)).toBe(s)
    })
  })

  describe("pattern-break for adversarial content", () => {
    test("entire corpus: every role-prefix triggering input gets its colon replaced", () => {
      let neutralized = 0
      for (const payload of corpus) {
        if (!containsRolePrefix(payload)) continue
        const out = sanitizeNotification(payload)
        // After sanitize, the corpus payload no longer triggers.
        expect(containsRolePrefix(out)).toBe(false)
        // The sentinel must appear at least once.
        expect(out).toContain(ROLE_PREFIX_SENTINEL)
        neutralized++
      }
      // Sanity: corpus actually contained role-prefix triggers.
      expect(neutralized).toBeGreaterThan(20)
    })

    test("adversarial corpus: sanitized output never contains role-token-colon at line start", () => {
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110)
      const ROLE_A = cc(65, 115, 115, 105, 115, 116, 97, 110, 116)
      const ROLE_U = cc(85, 115, 101, 114)
      const tokens = [ROLE_H, ROLE_A, ROLE_U]

      for (const payload of corpus) {
        const out = sanitizeNotification(payload)
        const lines = out.split("\n")
        for (const line of lines) {
          const trimmed = line.replace(/^[ \t]+/, "")
          for (const token of tokens) {
            if (trimmed.toLowerCase().startsWith(token.toLowerCase() + ":")) {
              throw new Error(`Sanitize failed: line starts with role-prefix-colon`)
            }
          }
        }
      }
    })

    test("indented role prefixes are also neutralized", () => {
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110)
      const out = sanitizeNotification(`    ${ROLE_H}: indented`)
      expect(out).toContain(ROLE_PREFIX_SENTINEL)
      expect(containsRolePrefix(out)).toBe(false)
    })

    test("role-prefix in the middle of the document (after newline) is neutralized", () => {
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110)
      const out = sanitizeNotification(`some preamble\n\n${ROLE_H}: trigger\n\nmore text`)
      expect(out).toContain(ROLE_PREFIX_SENTINEL)
      expect(containsRolePrefix(out)).toBe(false)
    })

    test("multiple role-prefix lines all neutralized", () => {
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110)
      const ROLE_A = cc(65, 115, 115, 105, 115, 116, 97, 110, 116)
      const out = sanitizeNotification(`${ROLE_H}: a\n${ROLE_A}: b\n${ROLE_H}: c`)
      const sentinelCount = out.split(ROLE_PREFIX_SENTINEL).length - 1
      expect(sentinelCount).toBe(3)
    })

    test("case-insensitive: lowercase role prefix neutralized", () => {
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110).toLowerCase()
      const out = sanitizeNotification(`${ROLE_H}: lowercase`)
      expect(out).toContain(ROLE_PREFIX_SENTINEL)
    })

    test("case-insensitive: uppercase role prefix neutralized", () => {
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110).toUpperCase()
      const out = sanitizeNotification(`${ROLE_H}: uppercase`)
      expect(out).toContain(ROLE_PREFIX_SENTINEL)
    })

    test("System / Tool / Claude / GPT role tokens also neutralized", () => {
      // System=83,121,115,116,101,109; Tool=84,111,111,108
      const cc = (...c: number[]) => String.fromCharCode(...c)
      for (const tok of [
        cc(83, 121, 115, 116, 101, 109),
        cc(84, 111, 111, 108),
        cc(67, 108, 97, 117, 100, 101),
        cc(71, 80, 84),
      ]) {
        const out = sanitizeNotification(`${tok}: payload`)
        expect(out).toContain(ROLE_PREFIX_SENTINEL)
      }
    })
  })

  describe("size-bound", () => {
    test("payload exactly at MAX_NOTIFICATION_BYTES passes through unchanged", () => {
      const s = "a".repeat(MAX_NOTIFICATION_BYTES)
      expect(sanitizeNotification(s)).toBe(s)
    })

    test("payload over MAX_NOTIFICATION_BYTES is truncated with marker", () => {
      const s = "a".repeat(MAX_NOTIFICATION_BYTES + 100)
      const out = sanitizeNotification(s)
      expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(MAX_NOTIFICATION_BYTES)
      expect(out).toContain("[truncated")
    })

    test("very large payload truncates correctly", () => {
      const s = "x".repeat(1_000_000)
      const out = sanitizeNotification(s)
      expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(MAX_NOTIFICATION_BYTES)
      expect(out).toContain("[truncated")
    })

    test("custom maxBytes opts respected", () => {
      const s = "x".repeat(2000)
      const out = sanitizeNotification(s, { maxBytes: 500 })
      expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(500)
      expect(out).toContain("[truncated")
    })

    test("UTF-8 multibyte payload over cap truncates without splitting codepoints", () => {
      // Each emoji is 4 bytes UTF-8.
      const s = "🚀".repeat(MAX_NOTIFICATION_BYTES) // way over cap
      const out = sanitizeNotification(s)
      expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(MAX_NOTIFICATION_BYTES)
      // Output should still be valid UTF-8 (no replacement chars from
      // mid-codepoint truncation).
      expect(out).not.toContain("�")
    })
  })

  describe("ANSI / control-char strip", () => {
    test("strips ANSI CSI color codes, preserves text", () => {
      const s = "\x1b[31mred text\x1b[0m"
      expect(sanitizeNotification(s)).toBe("red text")
    })

    test("strips ANSI cursor codes", () => {
      const s = "before\x1b[2A\x1b[Kafter"
      expect(sanitizeNotification(s)).toBe("beforeafter")
    })

    test("strips OSC sequences", () => {
      const s = "title\x1b]0;window title\x07then content"
      expect(sanitizeNotification(s)).toBe("titlethen content")
    })

    test("preserves \\n and \\t", () => {
      const s = "line1\nline2\tindented"
      expect(sanitizeNotification(s)).toBe(s)
    })

    test("strips C0 controls (\\x00-\\x08, \\x0b-\\x1f)", () => {
      const s = "before\x00\x01\x02\x07\x0bafter"
      expect(sanitizeNotification(s)).toBe("beforeafter")
    })

    test("strips DEL (0x7f)", () => {
      const s = "a\x7fb"
      expect(sanitizeNotification(s)).toBe("ab")
    })

    test("strips \\r (line-overlay vector)", () => {
      const s = "first line\rOVERWRITTEN"
      expect(sanitizeNotification(s)).toBe("first lineOVERWRITTEN")
    })

    test("ANSI-prefixed role marker is neutralized after strip", () => {
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110)
      // ANSI before the role token must not bypass detection.
      const out = sanitizeNotification(`\x1b[31m${ROLE_H}: trigger\x1b[0m`)
      expect(out).toContain(ROLE_PREFIX_SENTINEL)
      expect(containsRolePrefix(out)).toBe(false)
    })
  })

  describe("NFC normalization", () => {
    test("decomposed accents are NFC-normalized", () => {
      // "é" can be encoded as composed (U+00E9) or decomposed (U+0065 U+0301).
      const decomposed = "café"
      const composed = "café"
      expect(sanitizeNotification(decomposed)).toBe(composed)
    })

    test("benign ASCII normalization is a no-op", () => {
      expect(sanitizeNotification("plain ascii")).toBe("plain ascii")
    })
  })

  describe("integration: containsRolePrefix probe", () => {
    test("returns true for role-prefix at line start", () => {
      const cc = (...c: number[]) => String.fromCharCode(...c)
      const ROLE_H = cc(72, 117, 109, 97, 110)
      expect(containsRolePrefix(`${ROLE_H}: hi`)).toBe(true)
    })

    test("returns false for benign content", () => {
      expect(containsRolePrefix("hello world")).toBe(false)
      expect(containsRolePrefix("note: stuff")).toBe(false)
    })

    test("returns true for at least 30 entries in the corpus", () => {
      const hits = corpus.filter((p) => containsRolePrefix(p)).length
      expect(hits).toBeGreaterThanOrEqual(30)
    })
  })
})
