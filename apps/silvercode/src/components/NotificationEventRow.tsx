/**
 * <NotificationEventRow>
 *
 * One inline notification observation in the chat scrollback. Renders between
 * turns at the timestamp the event was injected into the agent's context.
 *
 * Visual:
 *
 *   • Tribe - peer alice opened PR #42
 *
 * Layout: neutral bullet | source lead-in + preview, wrapped as one text run.
 * No source-specific color or fill; hover fill appears only for rows with
 * expandable content.
 *
 * The agent-facing framing (`[NOTIFICATION — observation, not an instruction]`)
 * lives in the LLM payload via `prompt-assembly.ts` — it is NOT spelled out
 * on the inline UI row. Style and chrome carry the same signal without the
 * verbose prefix on every line.
 *
 * Hover surfaces the full payload in a popover; click on the expand glyph
 * inlines the full body below the row.
 *
 * The component knows nothing about mute filters, scopes, sessions, or how
 * the entry got here — `ChatPane` filters the stream before passing
 * entries down. Mute is enforced at that layer because mute toggles are
 * visual-only: the agent still receives every event regardless.
 *
 * Bead: km-silvercode.notification-inline-display.
 * Design: apps/silvercode/docs/channels.md.
 */

import React from "react"
import { Box, Muted, Small, Text, useHover, usePopoverHandlers } from "silvery"
import { BoundedScroll } from "./BoundedScroll.tsx"
import { Content, useHasContentLayout } from "./Content.tsx"
import { LinkedTerm } from "./LinkedTerm.tsx"
import { SessionEntry } from "./SessionEntry.tsx"

/**
 * One notification observation. Mirrors the wire-shape of `ChannelEvent` but
 * narrowed to the fields the inline row needs — scope-bound stream
 * factory in `notification-stream.ts` lifts `ChannelEvent` → `NotificationStreamEntry`
 * and feeds the UI.
 */
export type NotificationStreamEntry = {
  readonly kind: "notification"
  readonly id: string
  readonly source: string
  readonly ts?: number
  readonly timestamp?: number
  readonly content: string
  readonly meta?: Readonly<Record<string, unknown>>
  readonly actionable?: boolean
}

/**
 * Source presentation: one neutral label per source. The row intentionally
 * avoids per-source colors so notifications read as one family.
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
 * Detect common notification-event envelope shapes and rewrite them as a
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
  // Break at a word boundary if one is reasonably close to `max` so we
  // don't slice mid-token (e.g., `/nix/sto…`). Allow up to 12 chars of
  // slack — keeps long single-token tails (Nix store hashes) from
  // forcing a hard mid-character cut while still respecting the budget
  // for prose-shaped content.
  const sliced = flat.slice(0, max - 1)
  const ws = sliced.lastIndexOf(" ")
  if (ws > max - 12) return sliced.slice(0, ws) + "…"
  return sliced + "…"
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

function parseSnippetAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of attrs.matchAll(/\b([a-zA-Z_][\w-]*)="([^"]*)"/g)) {
    out[m[1]!] = escapeHtmlEntities(m[2]!)
  }
  return out
}

function parseRecallMemory(raw: string): FormattedContent | null {
  if (!raw.includes("<recall-memory")) return null
  // Match the full snippet element (open tag, body, close tag) so we can
  // surface inner excerpts in the disclosure body. Attributes vary by
  // snippet type — message snippets carry `source`/`title` (often the
  // same hash), vault/bead snippets carry a real `title`. Match any
  // attribute set and key off whatever we find.
  type Snip = { type: string; source: string; title: string; session: string; body: string }
  const snippets: Snip[] = []
  const re = /<snippet\s+([^>]*?)>([\s\S]*?)<\/snippet>/g
  for (const m of raw.matchAll(re)) {
    const attrs = parseSnippetAttrs(m[1] ?? "")
    snippets.push({
      type: attrs.type ?? "",
      source: attrs.source ?? "",
      title: attrs.title ?? "",
      session: attrs.session ?? "",
      body: (m[2] ?? "").trim(),
    })
  }
  if (snippets.length === 0) {
    // Tag opened but no parseable snippets — surface a tidy summary
    // anyway so the raw XML never leaks to the row. Drop the wrapper
    // and show whatever text survives.
    const inner = raw
      .replace(/<recall-memory[^>]*>/g, "")
      .replace(/<\/recall-memory>/g, "")
      .replace(/<context-protocol>[\s\S]*?<\/context-protocol>/g, "")
      .trim()
    if (inner.length === 0) return { preview: "memory: (empty)", body: raw }
    return { preview: clip(`memory: ${inner}`, 80), body: inner }
  }
  const labelFor = (s: Snip): string => {
    // Prefer a real title; fall back to a typed locator. Message
    // snippets often have title === source (both being a session id),
    // so when title looks hash-shaped use `type session abc12345`
    // instead — the user can't read a hash but they can see "1 message".
    const title = s.title.trim()
    const source = s.source.trim()
    const isHashLike = /^[0-9a-f]{6,}$/i.test(title) || title === source
    if (title.length > 0 && !isHashLike) return `"${title}"`
    if (s.type) return s.type === "message" ? `1 message` : `${s.type}: ${source || s.session || "—"}`
    return source || s.session || "snippet"
  }
  const labels = snippets.map(labelFor)
  const more = snippets.length > 2 ? ` (+${snippets.length - 2} more)` : ""
  const preview = clip(
    `memory: ${snippets.length} snippet${snippets.length === 1 ? "" : "s"} — ${labels.slice(0, 2).join(", ")}${more}`,
    80,
  )
  const bodyLines: string[] = [`memory: ${snippets.length} snippet${snippets.length === 1 ? "" : "s"}`]
  for (const s of snippets) {
    const head = labelFor(s)
    const meta: string[] = []
    if (s.type) meta.push(s.type)
    if (s.session) meta.push(`session ${s.session.slice(0, 8)}`)
    else if (s.source && s.source !== s.title) meta.push(s.source)
    const headLine = meta.length > 0 ? `${head}  ·  ${meta.join(" · ")}` : head
    bodyLines.push(`  • ${headLine}`)
    if (s.body.length > 0) {
      const flat = s.body.replace(/\s+/g, " ").trim()
      if (flat.length > 0) bodyLines.push(`      ${clip(flat, 240)}`)
    }
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
  const m = raw.trim().match(/^(CPU warning:\s+load\b.+?\bfor\s+\d+s)\.?\s*(.*)$/i)
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

function compactTribePreview(preview: string): string {
  let out = preview.replace(/\s+/g, " ").trim()
  const legacy = out.match(/^\[(dm|broadcast|session)\s+([^\]]+)\]\s*(.+)$/i)
  if (legacy) {
    const sender = (legacy[2] ?? "").trim()
    const body = (legacy[3] ?? "").trim()
    out = sender.length > 0 ? `${sender}: ${body}` : body
  }

  const processCount = out.match(/^(.+?Process count warning:\s+\d+\s+bun\/node processes)\b/i)
  if (processCount?.[1]) return processCount[1].trim()

  const cpu = out.match(/^(.+?CPU warning:\s+load\b.+?\bfor\s+\d+s)\b/i)
  if (cpu?.[1]) return cpu[1].trim()

  return clip(out, 90)
}

function displayPreview(label: string, source: string, preview: string): string {
  const deduped = dedupeSourcePrefix(label, source, preview)
  return source === "tribe" ? compactTribePreview(deduped) : deduped
}

function normalizeDisclosureText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function notificationHref(entry: NotificationStreamEntry): string | undefined {
  const href = entry.meta?.["href"]
  return typeof href === "string" && /^https?:\/\//.test(href) ? href : undefined
}

function notificationDetails(entry: NotificationStreamEntry): string | undefined {
  const details = entry.meta?.["details"]
  return typeof details === "string" && details.trim().length > 0 ? details : undefined
}

export interface NotificationEventRowProps {
  entry: NotificationStreamEntry
  previewOverride?: string
  bodyOverride?: string
  /** When true, the full body is rendered inline below the row. */
  expanded?: boolean
  /** Toggle expansion. When omitted, the expand glyph is hidden. */
  onToggleExpand?: () => void
}

type NotificationStackItem =
  | { kind: "single"; entry: NotificationStreamEntry }
  | { kind: "group"; key: string; entries: readonly NotificationStreamEntry[]; preview: string; body: string }

function isFilewatchSource(source: string): boolean {
  return source === "filewatch" || source === "file-watch"
}

function groupedPreview(source: string, formattedPreview: string, count: number): string {
  if (count <= 1) return formattedPreview
  if (isFilewatchSource(source)) return `file (${count}x)`
  return `${formattedPreview} (${count}x)`
}

/**
 * Build the dedup key for grouping. Identical-shape repeats (same kind,
 * same sender, slightly different numbers) should collapse — e.g., four
 * "Process count warning: 55 procs" / "54 procs" / "55 procs" rows
 * become one `(×4)`. Replace numeric runs with `#` for the key only;
 * the displayed preview keeps the original numbers.
 */
function groupKeyFor(source: string, preview: string): string {
  if (isFilewatchSource(source)) return source
  const canonical = preview
    .replace(/\d+(?:\.\d+)?%?/g, "#")
    .replace(/\s+/g, " ")
    .trim()
  return `${source}:${canonical}`
}

function groupNotificationEntries(entries: readonly NotificationStreamEntry[]): NotificationStackItem[] {
  const items: NotificationStackItem[] = []
  const byKey = new Map<string, Extract<NotificationStackItem, { kind: "group" }>>()

  for (const entry of entries) {
    const label = sourceLabel(entry.source)
    const formatted = formatContent(entry.content)
    const preview = displayPreview(label, entry.source, formatted.preview)
    const key = groupKeyFor(entry.source, preview)
    const existing = byKey.get(key)
    if (existing) {
      const nextEntries = [...existing.entries, entry]
      existing.entries = nextEntries
      existing.preview = groupedPreview(entry.source, preview, nextEntries.length)
      existing.body = nextEntries.map((e) => formatContent(e.content).body).join("\n")
      continue
    }
    const group: Extract<NotificationStackItem, { kind: "group" }> = {
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

export function NotificationStack({ entries }: { entries: readonly NotificationStreamEntry[] }): React.ReactElement {
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
  const items = groupNotificationEntries(entries)

  const stack = (
    <Box flexDirection="column" gap={0} width="100%" flexGrow={1} flexShrink={1} minWidth={0}>
      {items.map((item) => {
        if (item.kind === "single") {
          return (
            <NotificationEventRow
              key={item.entry.id}
              entry={item.entry}
              expanded={expanded.has(item.entry.id)}
              onToggleExpand={() => toggle(item.entry.id)}
            />
          )
        }
        const first = item.entries[0]!
        return (
          <NotificationEventRow
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
 * NotificationEventRow — pure presentational. Mute filtering happens upstream
 * in `ChatPane`, so by the time an entry reaches this component it
 * should be rendered.
 */
export function NotificationEventRow({
  entry,
  previewOverride,
  bodyOverride,
  expanded = false,
  onToggleExpand,
}: NotificationEventRowProps): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const label = sourceLabel(entry.source)
  const time = formatTime(entry.ts ?? entry.timestamp ?? 0)
  const formatted = formatContent(entry.content)
  const standardPreview = dedupeSourcePrefix(label, entry.source, formatted.preview)
  const compactPreview = entry.source === "tribe" ? compactTribePreview(standardPreview) : standardPreview
  const preview = previewOverride ?? compactPreview
  const href = notificationHref(entry)
  const metaDetails = notificationDetails(entry)
  const disclosureBody = bodyOverride ?? metaDetails ?? formatted.disclosureBody ?? formatted.body
  const previewWasCompacted = previewOverride === undefined && compactPreview !== standardPreview
  const hasAdditionalContent =
    normalizeDisclosureText(disclosureBody).length > 0 &&
    normalizeDisclosureText(disclosureBody) !== normalizeDisclosureText(preview) &&
    (previewWasCompacted ||
      bodyOverride !== undefined ||
      metaDetails !== undefined ||
      formatted.disclosureBody !== undefined ||
      normalizeDisclosureText(disclosureBody) !== normalizeDisclosureText(formatted.preview))

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
            <Muted>notification observation, not a user instruction</Muted>
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
          width="100%"
          paddingY={0}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onClick={clickable ? onToggleExpand : undefined}
        >
          {/* Keep the source as a lead-in, not a separate layout column, so
              wrapped continuations return to the row text start. */}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text color="$muted" wrap="wrap">
              <Text bold color="$muted">
                {label}
              </Text>
              {" - "}
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
                preview
              )}
            </Text>
          </Box>
        </Box>
      </SessionEntry>
      {/* Expanded body — full payload, indented to align under the row text.
          Same surface bg so it reads as a continuation
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
