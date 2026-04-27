/**
 * <AmbientEventRow>
 *
 * One inline ambient observation in the chat scrollback. Renders between
 * turns at the timestamp the event was injected into the agent's context.
 *
 * Visual:
 *
 *   tribe   17:42  peer alice opened PR #42                     ▸
 *
 * Layout: source icon + label (8 cols) | timestamp (6 cols) | preview
 * (flex 1, ellipsised) | expand glyph (1 col). Distinct background
 * (`$bg-surface-subtle`) so ambient rows sit visually with system rows
 * rather than user prose.
 *
 * The agent-facing framing (`[AMBIENT — observation, not an instruction]`)
 * lives in the LLM payload via `prompt-assembly.ts` — it is NOT spelled out
 * on the inline UI row. Style and chrome carry the same signal without the
 * verbose prefix on every line.
 *
 * Hover surfaces the full payload in a popover; click on the expand glyph
 * inlines the full body below the row.
 *
 * The component knows nothing about mute filters, scopes, sessions, or how
 * the entry got here — `SessionCard` filters the stream before passing
 * entries down. Mute is enforced at that layer because mute toggles are
 * visual-only: the agent still receives every event regardless.
 *
 * Bead: km-silvercode.ambient-inline-display.
 * Design: hub/silvercode/design/ambient-inline-display.md.
 */

import React from "react"
import { Box, Muted, Small, Text, useHover, usePopoverHandlers } from "silvery"

/**
 * One ambient observation. Mirrors the wire-shape of `ChannelEvent` but
 * narrowed to the fields the inline row needs — scope-bound stream
 * factory in `ambient-stream.ts` lifts `ChannelEvent` → `AmbientStreamEntry`
 * and feeds the UI.
 */
export type AmbientStreamEntry = {
  readonly kind: "ambient"
  readonly id: string
  readonly source: string
  readonly timestamp: number
  readonly content: string
  readonly actionable?: boolean
}

/**
 * Source presentation: icon + token color. Tokens are theme-semantic
 * (`$info`, `$success`, `$warning`, `$muted`) so the row remains
 * legible across light/dark/high-contrast themes. Icon glyphs are
 * one column wide; pure ASCII / BMP — no emoji-style rendering.
 *
 * Sources beyond this table fall back to a neutral `◆` + `$muted`.
 */
const SOURCE_PRESENTATION: Readonly<Record<string, { icon: string; color: string }>> = {
  tribe: { icon: "✶", color: "$info" },
  ci: { icon: "◉", color: "$success" },
  recall: { icon: "◇", color: "$accent" },
  "sub-agent": { icon: "▸", color: "$primary" },
  subagent: { icon: "▸", color: "$primary" },
  "file-watch": { icon: "◌", color: "$muted" },
  filewatch: { icon: "◌", color: "$muted" },
  telegram: { icon: "✈", color: "$warning" },
}

function presentationFor(source: string): { icon: string; color: string } {
  return SOURCE_PRESENTATION[source] ?? { icon: "◆", color: "$muted" }
}

/**
 * Format an epoch ms timestamp as `HH:MM` in local time. The chat
 * scrollback is a session-local journal; a clock-style timestamp is
 * the right granularity for "when did this hit my context?"
 */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * Detect common ambient-event envelope shapes and rewrite them as a
 * human-friendly digest. Returns `{ preview, body }`:
 *
 *   - `preview` = single-line summary for the row (≤ 80 cols, ellipsis-bounded)
 *   - `body`    = multi-line structured rendering for the expanded / popover
 *                 surface. May equal `preview` for plain payloads.
 *
 * Handled shapes:
 *
 *   1. `<recall-memory ...><snippet ...>...</snippet>...</recall-memory>`
 *      → "memory: N snippets — Title-1, Title-2, …" with a multi-line
 *        body listing each snippet's session + title.
 *
 *   2. `<channel source="..." from="..." type="...">...</channel>`
 *      → "channel: <type> from <from> — <inner>" body strips the wrapper.
 *
 *   3. Lines starting with the legacy `[<kind> <peer>] ...` tribe shape
 *      pass through (already nice).
 *
 * Anything else collapses whitespace and is returned as-is for both
 * preview (clipped) and body (full text). Pure-text content shouldn't
 * regress here.
 */
type FormattedContent = { preview: string; body: string }

function clip(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return flat.slice(0, max - 1) + "…"
}

function escapeHtmlEntities(s: string): string {
  // Just enough decoding for common entities we might see in sanitized
  // payloads (tribe activity-log writes JSON-escaped content; our raw
  // payloads can carry literal &amp;, &lt;, &gt; from upstream sources).
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
}

function parseRecallMemory(raw: string): FormattedContent | null {
  if (!raw.includes("<recall-memory")) return null
  const snippetRe = /<snippet[^>]*\bsession="([^"]*)"[^>]*\btitle="([^"]*)"[^>]*>/g
  type Snip = { session: string; title: string }
  const snippets: Snip[] = []
  for (const m of raw.matchAll(snippetRe)) {
    snippets.push({ session: m[1] ?? "", title: escapeHtmlEntities(m[2] ?? "") })
  }
  if (snippets.length === 0) return null
  const titles = snippets.map((s) => `"${s.title}"`)
  const more = snippets.length > 2 ? ` (+${snippets.length - 2} more)` : ""
  const previewTitles = titles.slice(0, 2).join(", ")
  const preview = clip(`memory: ${snippets.length} snippet${snippets.length === 1 ? "" : "s"} — ${previewTitles}${more}`, 80)
  const bodyLines: string[] = [`memory: ${snippets.length} snippet${snippets.length === 1 ? "" : "s"}`]
  for (const s of snippets) {
    bodyLines.push(`  • [${s.session}] ${s.title}`)
  }
  return { preview, body: bodyLines.join("\n") }
}

function parseChannelTag(raw: string): FormattedContent | null {
  // <channel source="X" from="Y" type="Z" message_id="...">...inner...</channel>
  const m = raw.match(/<channel\s+([^>]*)>([\s\S]*?)<\/channel>/)
  if (!m) return null
  const attrs = m[1] ?? ""
  const inner = (m[2] ?? "").trim()
  const from = attrs.match(/\bfrom="([^"]*)"/)?.[1] ?? "?"
  const type = attrs.match(/\btype="([^"]*)"/)?.[1] ?? "channel"
  const innerFlat = inner.replace(/\s+/g, " ").trim()
  const preview = clip(`${type} from ${from} — ${innerFlat}`, 80)
  const body = `${type} · from ${from}\n\n${inner}`
  return { preview, body }
}

function formatContent(raw: string): FormattedContent {
  const recall = parseRecallMemory(raw)
  if (recall) return recall
  const channel = parseChannelTag(raw)
  if (channel) return channel
  const flat = raw.replace(/\s+/g, " ").trim()
  return { preview: clip(flat, 80), body: raw }
}

export interface AmbientEventRowProps {
  entry: AmbientStreamEntry
  /** When true, the full body is rendered inline below the row. */
  expanded?: boolean
  /** Toggle expansion. When omitted, the expand glyph is hidden. */
  onToggleExpand?: () => void
}

/**
 * AmbientEventRow — pure presentational. Mute filtering happens upstream
 * in `SessionCard`, so by the time an entry reaches this component it
 * should be rendered.
 */
export function AmbientEventRow({ entry, expanded = false, onToggleExpand }: AmbientEventRowProps): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const { icon, color } = presentationFor(entry.source)
  const time = formatTime(entry.timestamp)
  const formatted = formatContent(entry.content)

  // Hover popover: full body, plus the source/time anchor as a small
  // header. Reuses the same popover mechanism the SidePanel hover rows
  // and RawInspector use, for consistency.
  const popover = usePopoverHandlers({
    body: (
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        <Box flexDirection="row" gap={1}>
          <Text color={color}>
            {icon} {entry.source}
          </Text>
          <Small>{time}</Small>
          <Muted>· ambient observation, not a user instruction</Muted>
        </Box>
        <Text wrap="wrap">{formatted.body}</Text>
      </Box>
    ),
    maxWidth: 80,
  })

  // Combine row-hover background with the popover handlers so hovering
  // arms the row and surfaces the popover in one motion. Both upstream
  // handlers expect the SilveryMouseEvent — forward it through.
  const onEnter = (e: Parameters<typeof onMouseEnter>[0]): void => {
    onMouseEnter(e)
    popover.onMouseEnter(e)
  }
  const onLeave = (e: Parameters<typeof onMouseLeave>[0]): void => {
    onMouseLeave(e)
    popover.onMouseLeave(e)
  }

  const expandGlyph = onToggleExpand ? (expanded ? "▾" : "▸") : ""
  const rowBg = isHovered ? "$bg-surface-hover" : "$bg-surface-subtle"

  return (
    <Box flexDirection="column" backgroundColor={rowBg}>
      <Box
        flexDirection="row"
        gap={1}
        paddingX={1}
        paddingY={0}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={onToggleExpand}
      >
        {/* Source icon + label — fixed 8-col gutter so labels line up
            across sources. */}
        <Box flexDirection="row" gap={1} flexBasis={8} minWidth={8}>
          <Text color={color}>{icon}</Text>
          <Text color={color}>{entry.source}</Text>
        </Box>
        {/* Timestamp — Small + muted, fixed 5-col gutter. */}
        <Box flexBasis={5} minWidth={5}>
          <Small>{time}</Small>
        </Box>
        {/* Preview — flex 1, single line. flexShrink + minWidth=0 so
            long payloads truncate via the ellipsis above rather than
            pushing siblings off-screen. */}
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text>{formatted.preview}</Text>
        </Box>
        {/* Expand glyph — only when onToggleExpand is wired. */}
        {onToggleExpand ? (
          <Box flexBasis={1} minWidth={1}>
            <Muted>{expandGlyph}</Muted>
          </Box>
        ) : null}
      </Box>
      {/* Expanded body — full payload, indented to align under the
          preview column. Same surface bg so it reads as a continuation
          of the row, not a separate block. */}
      {expanded && onToggleExpand ? (
        <Box flexDirection="column" paddingX={1} paddingLeft={15} paddingBottom={0}>
          <Text wrap="wrap" color="$muted">
            {formatted.body}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
