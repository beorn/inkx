/**
 * <AmbientEventRow>
 *
 * One inline ambient observation in the chat scrollback. Renders between
 * turns at the timestamp the event was injected into the agent's context.
 *
 * Visual:
 *
 *   • Tribe peer alice opened PR #42
 *
 * Layout: neutral bullet | source action | preview (flex 1, wrapped).
 * No source-specific color or fill; hover fill appears only for rows with
 * expandable content.
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
import { BoundedScroll } from "./BoundedScroll.tsx"
import { Content, useHasContentLayout } from "./Content.tsx"
import { LinkedTerm } from "./LinkedTerm.tsx"
import { SessionEntry } from "./SessionEntry.tsx"

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
  readonly meta?: Readonly<Record<string, unknown>>
  readonly actionable?: boolean
}

/**
 * Source presentation: one neutral label per source. The row intentionally
 * avoids per-source colors so ambient notifications read as one family.
 */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  tribe: "Tribe",
  ci: "CI",
  recall: "Recall",
  "sub-agent": "Agent",
  subagent: "Agent",
  "file-watch": "Watch",
  filewatch: "Watch",
  telegram: "Telegram",
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.slice(0, 1).toUpperCase() + source.slice(1)
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
type FormattedContent = { preview: string; body: string; disclosureBody?: string }

function clip(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return flat.slice(0, max - 1) + "…"
}

function escapeHtmlEntities(s: string): string {
  // Just enough decoding for common entities we might see in sanitized
  // payloads (tribe activity-log writes JSON-escaped content; our raw
  // payloads can carry literal &amp;, &lt;, &gt; from upstream sources).
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
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
  const preview = clip(
    `memory: ${snippets.length} snippet${snippets.length === 1 ? "" : "s"} — ${previewTitles}${more}`,
    80,
  )
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
  const preview = innerFlat.length > 0 ? `${type} from ${from} — ${innerFlat}` : `${type} from ${from}`
  const body = innerFlat.length > 0 ? `${type} · from ${from}\n\n${inner}` : preview
  return { preview, body, disclosureBody: inner }
}

function splitCpuProcessItems(raw: string): string[] {
  return raw
    .split(/,\s+(?=\d+(?:\.\d+)?%)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function parseCpuWarning(raw: string): FormattedContent | null {
  const m = raw
    .trim()
    .match(/^(CPU warning:\s+load\b.+?\bfor\s+\d+s)\.?\s*(.*)$/i)
  if (!m) return null
  const preview = m[1]?.trim() ?? ""
  const details = m[2]?.trim() ?? ""
  if (!preview || !details) return null
  if (!/^[^:|]+:\s+\S/.test(details)) return null

  const lines: string[] = [preview]
  for (const section of details.split(/\s+\|\s+/)) {
    const sectionMatch = section.match(/^([^:]+):\s*(.+)$/)
    if (!sectionMatch) {
      for (const item of splitCpuProcessItems(section)) lines.push(item)
      continue
    }
    const label = sectionMatch[1]?.trim()
    const body = sectionMatch[2]?.trim() ?? ""
    if (label) lines.push(label)
    for (const item of splitCpuProcessItems(body)) lines.push(`  ${item}`)
  }

  return { preview, body: lines.join("\n"), disclosureBody: lines.join("\n") }
}

function formatContent(raw: string): FormattedContent {
  const recall = parseRecallMemory(raw)
  if (recall) return recall
  const channel = parseChannelTag(raw)
  if (channel) return channel
  const cpu = parseCpuWarning(raw)
  if (cpu) return cpu
  const flat = raw.replace(/\s+/g, " ").trim()
  return { preview: flat, body: raw }
}

function dedupeSourcePrefix(label: string, source: string, preview: string): string {
  const polishSourcePreview = (value: string): string => {
    if (source === "tribe") {
      return value.replace(/^(.+?)\s+joined\s+\(([^)]+)\)(\s+.*)?$/i, (_match, name, role, tail) => {
        return `${role} ${name} joined${tail ?? ""}`.trim()
      })
    }
    if (source === "ci") {
      return value.replace(/^failure:\s+(.+?) Builds:\s+(.+)$/i, (_match, system, names) => {
        const prefix = `${system} Builds:`
        const jobs = String(names)
          .split(",")
          .map((part) =>
            part.trim().replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), ""),
          )
          .filter((part) => part.length > 0)
        return jobs.length > 0 ? `failed ${system} builds: ${jobs.join(", ")}` : value
      })
    }
    return value
  }
  const stripSourceTags = (value: string): string => {
    const sourceTokens = new Set(
      [label, source, source.replace(/-/g, " "), source.replace(/-/g, "")]
        .flatMap((part) => part.split(/\s+/))
        .map((part) => part.replace(/[^a-z0-9]/gi, "").toLowerCase())
        .filter((part) => part.length > 0),
    )
    let out = value.trim()
    while (true) {
      const match = out.match(/^\[([^\]]+)\]\s*/)
      if (!match) return out
      const tagTokens = (match[1] ?? "")
        .split(/\s+/)
        .map((part) => part.replace(/[^a-z0-9]/gi, "").toLowerCase())
        .filter((part) => part.length > 0)
      if (!tagTokens.some((token) => sourceTokens.has(token))) return out
      out = out.slice(match[0].length).trimStart()
    }
  }
  const prefixes = [
    label,
    source,
    source.replace(/-/g, " "),
    source.replace(/-/g, ""),
    `${label} message`,
    `${source} message`,
    `${source.replace(/-/g, " ")} message`,
    "recall hit",
    "sub-agent finished",
  ].sort((a, b) => b.length - a.length)

  let out = preview.trim()
  while (true) {
    let changed = false
    for (const prefix of prefixes) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const re = new RegExp(`^${escaped}\\b\\s*:?\\s*`, "i")
      const next = out.replace(re, "").trim()
      if (next !== out) {
        out = next
        changed = true
        break
      }
    }
    if (!changed) break
  }
  return polishSourcePreview(stripSourceTags(out))
}

function normalizeDisclosureText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function ambientHref(entry: AmbientStreamEntry): string | undefined {
  const href = entry.meta?.["href"]
  return typeof href === "string" && /^https?:\/\//.test(href) ? href : undefined
}

function ambientDetails(entry: AmbientStreamEntry): string | undefined {
  const details = entry.meta?.["details"]
  return typeof details === "string" && details.trim().length > 0 ? details : undefined
}

export interface AmbientEventRowProps {
  entry: AmbientStreamEntry
  previewOverride?: string
  bodyOverride?: string
  /** When true, the full body is rendered inline below the row. */
  expanded?: boolean
  /** Toggle expansion. When omitted, the expand glyph is hidden. */
  onToggleExpand?: () => void
}

type AmbientStackItem =
  | { kind: "single"; entry: AmbientStreamEntry }
  | { kind: "group"; key: string; entries: readonly AmbientStreamEntry[]; preview: string; body: string }

function isFilewatchSource(source: string): boolean {
  return source === "filewatch" || source === "file-watch"
}

function groupedPreview(source: string, formattedPreview: string, count: number): string {
  if (count <= 1) return formattedPreview
  if (isFilewatchSource(source)) return `file (${count}x)`
  return `${formattedPreview} (${count}x)`
}

function groupAmbientEntries(entries: readonly AmbientStreamEntry[]): AmbientStackItem[] {
  const items: AmbientStackItem[] = []
  const byKey = new Map<string, Extract<AmbientStackItem, { kind: "group" }>>()

  for (const entry of entries) {
    const label = sourceLabel(entry.source)
    const formatted = formatContent(entry.content)
    const preview = dedupeSourcePrefix(label, entry.source, formatted.preview)
    const key = isFilewatchSource(entry.source) ? entry.source : `${entry.source}:${preview}`
    const existing = byKey.get(key)
    if (existing) {
      const nextEntries = [...existing.entries, entry]
      existing.entries = nextEntries
      existing.preview = groupedPreview(entry.source, preview, nextEntries.length)
      existing.body = nextEntries.map((e) => formatContent(e.content).body).join("\n")
      continue
    }
    const group: Extract<AmbientStackItem, { kind: "group" }> = {
      kind: "group",
      key,
      entries: [entry],
      preview,
      body: formatted.body,
    }
    byKey.set(key, group)
    items.push(group)
  }

  return items.map((item) =>
    item.kind === "group" && item.entries.length === 1 ? { kind: "single", entry: item.entries[0]! } : item,
  )
}

export function AmbientNotificationStack({ entries }: { entries: readonly AmbientStreamEntry[] }): React.ReactElement {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const hasContentLayout = useHasContentLayout()
  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const items = groupAmbientEntries(entries)

  const stack = (
    <Box flexDirection="column" gap={0} width="100%" flexGrow={1} flexShrink={1} minWidth={0}>
      {items.map((item) => {
        if (item.kind === "single") {
          return (
            <AmbientEventRow
              key={item.entry.id}
              entry={item.entry}
              expanded={expanded.has(item.entry.id)}
              onToggleExpand={() => toggle(item.entry.id)}
            />
          )
        }
        const first = item.entries[0]!
        return (
          <AmbientEventRow
            key={`group:${item.key}:${first.id}`}
            entry={first}
            previewOverride={item.preview}
            bodyOverride={item.body}
            expanded={expanded.has(item.key)}
            onToggleExpand={() => toggle(item.key)}
          />
        )
      })}
    </Box>
  )

  if (!hasContentLayout) return stack

  return (
    <Content.Row>
      <Content.Left>
        <Content.Aside show={false}>00:00</Content.Aside>
      </Content.Left>
      <Content.Prose>{stack}</Content.Prose>
    </Content.Row>
  )
}

/**
 * AmbientEventRow — pure presentational. Mute filtering happens upstream
 * in `SessionCard`, so by the time an entry reaches this component it
 * should be rendered.
 */
export function AmbientEventRow({
  entry,
  previewOverride,
  bodyOverride,
  expanded = false,
  onToggleExpand,
}: AmbientEventRowProps): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const label = sourceLabel(entry.source)
  const time = formatTime(entry.timestamp)
  const formatted = formatContent(entry.content)
  const preview = previewOverride ?? dedupeSourcePrefix(label, entry.source, formatted.preview)
  const href = ambientHref(entry)
  const metaDetails = ambientDetails(entry)
  const disclosureBody = bodyOverride ?? metaDetails ?? formatted.disclosureBody ?? formatted.body
  const hasAdditionalContent =
    normalizeDisclosureText(disclosureBody).length > 0 &&
    normalizeDisclosureText(disclosureBody) !== normalizeDisclosureText(preview) &&
    normalizeDisclosureText(disclosureBody) !== normalizeDisclosureText(formatted.preview)

  // Hover popover: full body, plus the source anchor and a top-right
  // timestamp. Reuses the same popover mechanism the SidePanel hover rows
  // and RawInspector use, for consistency.
  const popover = usePopoverHandlers({
    body: (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row">
          <Box flexDirection="row" gap={1}>
            <Text color="$muted">•</Text>
            <Text bold color="$fg">
              {label}
            </Text>
            <Muted>ambient observation, not a user instruction</Muted>
          </Box>
          <Box flexGrow={1} />
          <Small>{time}</Small>
        </Box>
        <Text wrap="wrap">{bodyOverride ?? disclosureBody}</Text>
      </Box>
    ),
    maxWidth: 80,
  })

  // Combine row-hover background with the popover handlers so hovering
  // arms the row and surfaces the popover in one motion. Both upstream
  // handlers expect the SilveryMouseEvent — forward it through.
  const onEnter = (e: Parameters<typeof onMouseEnter>[0]): void => {
    onMouseEnter(e)
    if (hasAdditionalContent) popover.onMouseEnter(e)
  }
  const onLeave = (e: Parameters<typeof onMouseLeave>[0]): void => {
    onMouseLeave(e)
    if (hasAdditionalContent) popover.onMouseLeave(e)
  }

  const clickable = typeof onToggleExpand === "function" && hasAdditionalContent
  const rowBg = clickable && isHovered ? "$bg-surface-hover" : undefined

  return (
    <Box flexDirection="column" backgroundColor={rowBg}>
      <SessionEntry marker="•" markerColor="$muted">
        <Box
          flexDirection="row"
          gap={1}
          width="100%"
          paddingY={0}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onClick={clickable ? onToggleExpand : undefined}
        >
          <Text bold color="$muted">
            {label}
          </Text>
          {/* Preview — flex 1, wrapping. flexShrink + minWidth=0 keeps long
              payloads inside the content lane instead of pushing siblings
              or the side panel off-screen. */}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            {href ? (
              <LinkedTerm
                href={href}
                color="$muted"
                popoverBody={
                  <Box flexDirection="column">
                    <Text bold>{preview}</Text>
                    <Text wrap="wrap">{disclosureBody}</Text>
                  </Box>
                }
              >
                {preview}
              </LinkedTerm>
            ) : (
              <Text color="$muted" wrap="wrap">
                {preview}
              </Text>
            )}
          </Box>
        </Box>
      </SessionEntry>
      {/* Expanded body — full payload, indented to align under the
          preview column. Same surface bg so it reads as a continuation
          of the row, not a separate block. Bounded to 30 visible rows
          with kinetic-scroll past that bound — a chatty filewatch burst
          shouldn't push 200 lines of "X changed" into the chat. */}
      {expanded && clickable ? (
        <Box flexDirection="column" paddingBottom={0}>
          <BoundedScroll>
            <Text wrap="wrap" color="$muted">
              {disclosureBody}
            </Text>
          </BoundedScroll>
        </Box>
      ) : null}
    </Box>
  )
}
