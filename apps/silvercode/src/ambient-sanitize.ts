/**
 * Ambient payload sanitization (Layer 2 of the ambient-context safety
 * stack — see `hub/silvercode/design/ambient-context-safety.md`).
 *
 * Pure deterministic function, called on every ambient payload before
 * `EmbeddedResource` construction. The Layer 0 source-side scrub
 * (vendor/bearly tribe-daemon + recall, Haiku rewrite) handles the
 * semantic-equivalent path; Layer 2 is the deterministic floor — runs
 * regardless, cheap, idempotent.
 *
 * Four passes, in order:
 *
 *   1. Strip ANSI escape sequences and other control characters
 *      (preserving newlines + tabs which are legitimate content).
 *   2. Unicode-normalize (NFC) so combining-mark variants of role tokens
 *      can't bypass the pattern-break.
 *   3. Pattern-break role-prefix markers. Lines beginning with a
 *      well-known role token followed by `:` get the colon replaced with
 *      a sentinel so the token no longer parses as a turn header. The
 *      role tokens themselves are constructed from char codes — they
 *      never appear as literal text in this source file. See § 9 of the
 *      design doc (content quarantine).
 *   4. Size-bound (`MAX_AMBIENT_BYTES`, default 16 KiB) with a visible
 *      `[truncated …]` marker.
 *
 * Idempotent: `sanitizeAmbient(sanitizeAmbient(x)) === sanitizeAmbient(x)`.
 * Meaning-preserving for benign content: ASCII text without role-prefix
 * patterns or ANSI escapes passes through with at most NFC normalization
 * (a no-op for ASCII).
 */

const cc = (...codes: readonly number[]): string => String.fromCharCode(...codes)

/**
 * Role tokens to neutralize. Constructed from char codes so the literal
 * trigger words don't appear as searchable text in this file. These are
 * the tokens that train-time priors associate with multi-turn dialogue
 * structure.
 */
const ROLE_TOKENS: readonly string[] = [
  cc(72, 117, 109, 97, 110), // H‑u‑m‑a‑n
  cc(65, 115, 115, 105, 115, 116, 97, 110, 116), // A‑s‑s‑i‑s‑t‑a‑n‑t
  cc(85, 115, 101, 114), // U‑s‑e‑r
  cc(83, 121, 115, 116, 101, 109), // S‑y‑s‑t‑e‑m
  cc(67, 108, 97, 117, 100, 101), // C‑l‑a‑u‑d‑e
  cc(71, 80, 84), // G‑P‑T
  cc(84, 111, 111, 108), // T‑o‑o‑l
]

/**
 * Sentinel inserted in place of `:` when a role-prefix marker is detected.
 * Visible to a human reader (so the original intent is recoverable from
 * the sanitized payload) but breaks the token+colon completion shape.
 */
export const ROLE_PREFIX_SENTINEL = "[QUARANTINED-COLON]"

/** Default size cap. 16 KiB is plenty for a tribe broadcast or recall hit. */
export const MAX_AMBIENT_BYTES = 16 * 1024

/** Truncation marker. Visible inside the sanitized body. */
const TRUNCATION_MARKER = "\n\n[truncated — payload exceeded ambient size cap]"

/**
 * Build the role-prefix regex from `ROLE_TOKENS` at module load. Anchored
 * to start-of-string OR after a newline so embedded role markers mid-line
 * (which aren't the failure pattern) pass through unchanged.
 */
const ROLE_PREFIX_RE: RegExp = (() => {
  const alt = ROLE_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  return new RegExp(`(^|\\n)([ \\t]*)(${alt})(:)`, "gi")
})()

/**
 * ANSI / control-char strip. Preserves \n (LF, 0x0A) and \t (HT, 0x09).
 * Strips ANSI CSI sequences (`ESC [ … final-byte`), OSC (`ESC ] … BEL/ST`),
 * other ESC-prefixed sequences, and remaining C0 controls + DEL.
 *
 * Source uses `\x` escapes so the file stays ASCII-printable — no embedded
 * ESC bytes that would break grep/diff/recall.
 */
const ANSI_CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const ANSI_OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g
const OTHER_ESC_RE = /\x1b[@-Z\\\-_]/g
// C0 controls (0x00-0x08, 0x0b-0x1f) + DEL (0x7f). Preserves 0x09 (\t)
// and 0x0a (\n). 0x0d (\r) intentionally stripped (line-overlay vector).
const CONTROL_CHARS_RE = /[\x00-\x08\x0b-\x1f\x7f]/g

function stripAnsiAndControls(s: string): string {
  return s.replace(ANSI_OSC_RE, "").replace(ANSI_CSI_RE, "").replace(OTHER_ESC_RE, "").replace(CONTROL_CHARS_RE, "")
}

function neutralizeRolePrefixes(s: string): string {
  ROLE_PREFIX_RE.lastIndex = 0
  return s.replace(ROLE_PREFIX_RE, (_m, anchor: string, ws: string, token: string) => {
    return `${anchor}${ws}${token}${ROLE_PREFIX_SENTINEL}`
  })
}

function sizeBound(s: string, maxBytes: number): string {
  // UTF-8 byte length is what the wire actually counts.
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s
  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, "utf8")
  // Binary-search the longest codepoint-prefix that fits with the marker.
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (Buffer.byteLength(s.slice(0, mid), "utf8") + markerBytes <= maxBytes) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return s.slice(0, lo) + TRUNCATION_MARKER
}

/**
 * Sanitize one ambient payload. Pure, idempotent, no I/O.
 *
 * Pass order:
 *   1. Strip ANSI/controls FIRST so role-prefix detection isn't fooled.
 *   2. NFC-normalize BEFORE pattern-break (combining-mark bypass).
 *   3. Pattern-break role prefixes.
 *   4. Size-bound LAST so the truncation marker isn't stripped.
 */
export function sanitizeAmbient(payload: string, opts: { maxBytes?: number } = {}): string {
  return sanitizeAmbientWithReport(payload, opts).output
}

/**
 * Per-action breakdown of what `sanitizeAmbient` actually did to the
 * input. Returned by `sanitizeAmbientWithReport` so Layer 4 telemetry
 * can record exactly which transformations fired (Phase 6.b).
 *
 * Each boolean is `true` iff that pass produced a different result —
 * benign payloads return all-`false`. Order of the booleans matches the
 * pass order in `sanitizeAmbient`.
 */
export type SanitizeReport = {
  readonly output: string
  readonly ansiStripped: boolean
  readonly nfcNormalized: boolean
  readonly rolePrefixNeutralized: boolean
  readonly sizeTruncated: boolean
  /**
   * First 8 code units of the input — only populated when
   * `rolePrefixNeutralized` is true, so telemetry has a redacted
   * snippet to log without storing the full payload.
   */
  readonly rolePrefixSnippet?: string
}

/**
 * Same as `sanitizeAmbient` but reports which passes fired. Used by
 * the telemetry-instrumented call-sites; pure-logic call-sites should
 * keep using `sanitizeAmbient` directly.
 */
export function sanitizeAmbientWithReport(payload: string, opts: { maxBytes?: number } = {}): SanitizeReport {
  const maxBytes = opts.maxBytes ?? MAX_AMBIENT_BYTES
  const stripped = stripAnsiAndControls(payload)
  const ansiStripped = stripped !== payload
  const normalized = stripped.normalize("NFC")
  const nfcNormalized = normalized !== stripped
  const neutralized = neutralizeRolePrefixes(normalized)
  const rolePrefixNeutralized = neutralized !== normalized
  const bounded = sizeBound(neutralized, maxBytes)
  const sizeTruncated = bounded !== neutralized
  const rolePrefixSnippet = rolePrefixNeutralized ? payload.slice(0, 8) : undefined
  return {
    output: bounded,
    ansiStripped,
    nfcNormalized,
    rolePrefixNeutralized,
    sizeTruncated,
    rolePrefixSnippet,
  }
}

/**
 * Probe: does the input contain any role-prefix marker that
 * `sanitizeAmbient` would neutralize? Useful for telemetry — Layer 4
 * detection logs ambient payloads where this returns true.
 */
export function containsRolePrefix(payload: string): boolean {
  ROLE_PREFIX_RE.lastIndex = 0
  return ROLE_PREFIX_RE.test(payload)
}
