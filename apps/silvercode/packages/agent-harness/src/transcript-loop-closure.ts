/**
 * Transcript loop-closure (Layer 3 of the notification-context safety stack).
 *
 * Lives in agent-harness because the parser (`parse.ts`) is the canonical
 * point at which assistant text blocks are constructed — that's where
 * re-ingestion gets prevented. silvercode/src/transcript.ts re-exports
 * these functions for callers that work with `messages[]` arrays
 * (transcript builder, prompt assembly).
 *
 * Trigger tokens are constructed from char codes — they never appear as
 * literal text in this source file. See `apps/silvercode/docs/channels.md`
 * § 3 (Layer 3) and § 9 (content quarantine).
 */

const cc = (...codes: readonly number[]): string => String.fromCharCode(...codes)

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
 * Sentinel inserted in place of the colon when an assistant turn opens
 * with a role-prefix marker. Visible to a human reader; breaks the
 * token+colon shape that the next-turn parser would otherwise re-ingest.
 */
export const ASSISTANT_ROLE_QUARANTINE_SENTINEL = "[QUARANTINED — role-prefix detected]"

const ROLE_PREFIX_AT_START_RE: RegExp = (() => {
  const alt = ROLE_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  return new RegExp(`^([ \\t\\r\\n]*)(${alt})(:)`, "i")
})()

/**
 * True iff `text` opens with a role-prefix marker (after optional
 * whitespace). Used as a probe for telemetry + tests.
 */
export function startsWithRolePrefix(text: string): boolean {
  return ROLE_PREFIX_AT_START_RE.test(text)
}

/**
 * If `text` opens with a role-prefix marker, replace the marker's colon
 * with `ASSISTANT_ROLE_QUARANTINE_SENTINEL` inline. The rest of the text
 * is preserved. Idempotent.
 */
export function quarantineLeadingRolePrefix(text: string): string {
  if (!ROLE_PREFIX_AT_START_RE.test(text)) return text
  return text.replace(ROLE_PREFIX_AT_START_RE, `$1$2${ASSISTANT_ROLE_QUARANTINE_SENTINEL}`)
}
