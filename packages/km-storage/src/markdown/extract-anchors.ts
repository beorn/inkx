/**
 * Lightweight Anchor Extractor
 *
 * Regex-based pass over a markdown file's raw content to find the set of
 * targetable anchors inside the file — ATX headings (`## Section`) and
 * obsidian-style block refs (`^blockid`) — WITHOUT running the full mdast
 * parser. Used for collapsed-file inbound-reference resolution: when doc-Y
 * contains `[[file#Section]]` pointing at a collapsed file X, we still need
 * to know where `Section` lives inside X so the UI can scroll/render around
 * it, or at least surface the offset.
 *
 * This file is the INBOUND counterpart to `extract-links.ts` (which extracts
 * the OUTBOUND link edges). Together they form the two passes of collapse-
 * parse reference preservation:
 *
 *   Pass 1 (outbound): extractLinks() — what does file X link TO?
 *   Pass 2 (inbound):  extractAnchors() — where are the anchors inside X
 *                      that other files link TO?
 *
 * See `db/referenced-anchors.ts` for the table that stores the resolved
 * inbound-referenced anchors (pruned to only those actually referenced).
 *
 * Design:
 *   - Line-based scanning so a malformed line can't cascade.
 *   - Skips fenced code blocks (```). Headings inside a fenced block are
 *     NOT valid anchors.
 *   - ATX headings only (1-6 `#` + space + text). Setext headings (=== or
 *     ---) are intentionally skipped — they're rare in chat transcripts and
 *     the collapsed-file use case doesn't need them.
 *   - Block refs: `^[a-zA-Z0-9][a-zA-Z0-9-]*` at end of line or standalone.
 *     Matches obsidian's block-id syntax.
 *   - ATX closing hashes stripped (`## Plans ##` → anchor "Plans").
 *
 * Perf target: <50ms per 100KB file. Non-goal: mdast parity.
 *
 * Anchor vs rawText: `anchor` is the canonical form used for lookups (the
 * trimmed heading text or the full `^blockid` including the caret). `rawText`
 * preserves the authored form for debugging and future slug normalization.
 * v1 keeps these identical — callers that need obsidian-compatible slugs
 * (lowercase, dashes for spaces) can normalize at query time.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * One anchor (heading or block ref) found in a file's raw content.
 *
 * `anchor`       — canonical form for lookup. For headings: the trimmed
 *                  heading text (e.g. "Plans"). For block refs: the full
 *                  `^blockid` including the caret.
 * `rawText`      — authored form (same as `anchor` in v1; kept distinct for
 *                  future slug normalization).
 * `headingLevel` — 1-6 for ATX headings; absent for block refs.
 * `offset`       — byte offset of the anchor's line-start in the source.
 *                  For headings, this is the position of the first `#`.
 *                  For block refs, this is the position of the `^`.
 */
export interface ExtractedAnchor {
  anchor: string
  rawText: string
  headingLevel?: number
  offset: number
}

// ============================================================================
// REGEX PATTERNS
// ============================================================================

// ATX heading: `#{1,6}\s+text`. Captures the hash run and the heading text.
// Trailing `\s+#+\s*$` (optional closing hashes) is stripped after the match.
// 1-6 hashes exactly; 7+ hashes is not a valid ATX heading per CommonMark.
const ATX_HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/

// Strip optional ATX closing hashes: trailing ` ##` sequence after the text.
const ATX_CLOSER_RE = /\s+#+\s*$/

// Fenced code block fence line (``` optionally followed by language).
const FENCE_RE = /^```/

// Block ref at end of line: `text ... ^blockid` where `^blockid` is the last
// non-whitespace token on the line. Also matches a line that is just the
// block ref on its own (`^blockid\n`).
//
// Rules:
//   - Starts with `^`
//   - Must be [a-zA-Z0-9] then [a-zA-Z0-9-]*
//   - Must be at end-of-line (only whitespace after) OR standalone line
//   - Requires whitespace or start-of-line before the `^`
const BLOCKREF_RE = /(?:^|\s)(\^[a-zA-Z0-9][a-zA-Z0-9-]*)\s*$/

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Scan `content` for anchor occurrences (headings + block refs).
 *
 * Line-based; skips code fences. Returns a sorted list by offset.
 * An empty / whitespace-only / anchor-free file returns an empty array.
 */
export function extractAnchors(content: string): ExtractedAnchor[] {
  if (!content) return []
  const results: ExtractedAnchor[] = []

  const lines = content.split("\n")
  let offset = 0
  let inFence = false

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      offset += line.length + 1 // +1 for the `\n`
      continue
    }
    if (!inFence) {
      const atx = line.match(ATX_HEADING_RE)
      if (atx) {
        const hashes = atx[1] ?? ""
        const text = (atx[2] ?? "").replace(ATX_CLOSER_RE, "").trim()
        if (text.length > 0) {
          results.push({
            anchor: text,
            rawText: text,
            headingLevel: hashes.length,
            offset, // start-of-line for the heading
          })
        }
      } else {
        const block = line.match(BLOCKREF_RE)
        if (block) {
          const token = block[1]
          if (token) {
            // Position of `^` within the line
            const caretAt = line.lastIndexOf(token)
            if (caretAt >= 0) {
              results.push({
                anchor: token,
                rawText: token,
                offset: offset + caretAt,
              })
            }
          }
        }
      }
    }
    offset += line.length + 1
  }

  // Stable sort by offset for deterministic output.
  results.sort((a, b) => a.offset - b.offset)
  return results
}
