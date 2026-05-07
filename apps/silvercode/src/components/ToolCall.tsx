/**
 * <ToolCall>
 *
 * Canonical ACP `ToolCall` renderer — opencode-style flat row.
 *
 * Visual contract (v2, bead km-silvercode.tool-call-rendering-v2):
 *   - One single line per call. NO border, NO bg color on the row.
 *   - Format: `• <Action> rest` for non-shell calls and `$ <command>` for
 *     shell calls. No per-tool color coding; white/grey only.
 *   - Body (file content / stdout / diff) hidden by default. Reveals on
 *     mouse hover (`useHover` from silvery). NO "click to expand" affordance
 *     text. Hover is the entire interaction surface.
 *   - When the body reveals, it renders dim ($muted), no border, no bg,
 *     indented 2 cols. Tight density.
 *   - Failed call: inline error message renders immediately under the row,
 *     also no border / bg.
 *
 * Component family (all in `apps/silvercode/src/components/`):
 *   - <ToolCall>             — this component, top-level row
 *   - <ToolCallStatusTitle>  — neutral title with bold action word
 *   - <ToolCallError>        — standalone error envelope (used directly,
 *                              NOT composed inside ToolCall)
 *   - <ToolCallSummary>      — aggregate "Read 12 files" with rolling count
 *   - <ApplyPatch>           — Aider search/replace renderer
 *
 * Naming follows ACP exactly per `hub/silvercode/future/ai-terminal/acp-naming.md`.
 *
 * Bead: km-silvercode.tool-call-rendering-v2 (was: km-silvercode.acp-tool-call).
 */

import React from "react"
import { Box, Diff as SilveryDiff, Image, Link, type DiffHunk, Muted, Text, type SilveryMouseEvent } from "silvery"
import type { ToolCall as ToolCallType, ToolCallContent, ToolCallLocation, ContentBlock } from "@km/agent-harness"
import { ToolCallStatusTitle } from "./ToolCallStatusTitle.tsx"
import { BoundedScroll, DEFAULT_DISCLOSURE_MAX_ROWS } from "./BoundedScroll.tsx"
import { formatPathForDisplay, resolveDisplayPath } from "../utils/format-path.ts"
import { StatusGlyph } from "./StatusGlyph.tsx"
import { detectReferences } from "../detection.ts"
import { EntryDisclosure } from "./EntryDisclosure.tsx"

const ToolMarkerBackgroundContext = React.createContext<string | undefined>(undefined)
const ToolContentForceExpandedContext = React.createContext(false)

export function ToolMarkerBackgroundProvider({
  value,
  children,
}: {
  value?: string
  children: React.ReactNode
}): React.ReactElement {
  return <ToolMarkerBackgroundContext.Provider value={value}>{children}</ToolMarkerBackgroundContext.Provider>
}

export function ToolContentForceExpandedProvider({
  value,
  children,
}: {
  value: boolean
  children: React.ReactNode
}): React.ReactElement {
  return <ToolContentForceExpandedContext.Provider value={value}>{children}</ToolContentForceExpandedContext.Provider>
}

// =============================================================================
// Title path shortening
// =============================================================================

/**
 * Shorten any absolute paths embedded in a tool-call title for display.
 *
 * Tool-call titles are agent-supplied strings whose shape varies:
 *
 *   1. A bare path:          "/Users/beorn/Bear/Vault/RESOLVER.md"
 *   2. A path with line:     "/Users/beorn/Bear/Vault/RESOLVER.md:42"
 *   3. A phrase + path:      "Read /Users/beorn/Bear/Vault/RESOLVER.md"
 *   4. A shell command:      'ls -la "/Users/beorn/Bear/Vault/@inbox/"'
 *
 * v1 covers (1)+(2)+(3): we substitute every occurrence of an absolute
 * path that starts with `/Users/<name>/` (matching `$HOME`'s shape) using
 * `formatPathForDisplay`. Quoted paths inside command strings (case 4)
 * are caught too — the regex doesn't distinguish quoted from bare and
 * `formatPathForDisplay` is a pure rewrite that's safe to apply to a
 * substring. Non-path titles ("bun fix", "for grep") fall through
 * unchanged because the regex doesn't match.
 *
 * The home-prefix regex is conservative: it only fires on paths that
 * start with `$HOME/`. That avoids munging unrelated `/etc/...` or
 * `/tmp/...` substrings (they'd render verbatim anyway, but we don't
 * waste a substitution on them) and keeps the regex deterministic.
 *
 * Bead: km-silvercode.path-display-friendly.
 */
function shortenTitlePath(title: string): string {
  // Cheap fast path: if the title doesn't look like it could contain an
  // absolute path under $HOME, skip the regex entirely. This is the hot
  // path for non-path titles like "bun fix" / "for grep".
  const home = process.env["HOME"]
  if (!home || !title.includes(home)) return title
  // Replace every absolute path under $HOME. The trailing-segment match
  // is greedy across non-whitespace-non-quote characters so paths with
  // spaces still need quoting upstream — for the chat-surface use case
  // titles are never quoted, and tool-call paths don't contain spaces in
  // practice, so the simple form covers everything we see.
  const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`${escapedHome}(?:/[^\\s"']*)?`, "g")
  return title.replace(re, (match) => formatPathForDisplay(match))
}

// =============================================================================
// Helpers — derive renderable shapes from ACP `ToolCall` content variants.
// =============================================================================

/**
 * Build a single `DiffHunk` from an ACP `Diff` content variant. ACP's `Diff`
 * is two strings (oldText / newText) plus a path; the line-by-line hunk
 * shape silvery's `<Diff>` consumes is derived by splitting both on "\n"
 * and producing one hunk that spans the whole file. Real diff viewers do
 * Myers/LCS reduction; for v1 we punt and show the full old/new pair so
 * the user sees the shape without us re-implementing diff logic here.
 */
function splitDiffLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  return lines
}

function diffContentToHunks(content: { newText: string; oldText?: string | null }): DiffHunk[] {
  const oldLines = splitDiffLines(content.oldText ?? "")
  const newLines = splitDiffLines(content.newText)
  // Render every old line as a remove and every new line as an add. This
  // is structurally lossy vs a real diff but matches what ACP gives us
  // (two opaque strings) without hiding information. The mutable array
  // satisfies `DiffHunk["lines"]` (a `ReadonlyArray<DiffLine>`) at the
  // hunk-construction site below.
  const lines: { kind: "context" | "add" | "remove"; text: string }[] = []
  for (const text of oldLines) lines.push({ kind: "remove", text })
  for (const text of newLines) lines.push({ kind: "add", text })
  return [{ oldStart: 1, newStart: 1, lines }]
}

/**
 * Render text output verbatim. Height bounding belongs to the containing
 * scrollbox/popover, not to a line-count summary inside the content.
 */
const SUMMARY_THRESHOLD = 5
const SUMMARY_PREVIEW_LINES = 3

function renderTextContent(text: string, key: number | string, summarize = true): React.ReactElement {
  const lines = text.split("\n")
  if (summarize && lines.length > SUMMARY_THRESHOLD) {
    const preview = lines.slice(0, SUMMARY_PREVIEW_LINES).join("\n")
    const hidden = lines.length - SUMMARY_PREVIEW_LINES
    return (
      <Box key={key} flexDirection="column">
        <Text color="$fg-muted" wrap="wrap">
          {preview}
        </Text>
        <Muted>
          {hidden} more line{hidden === 1 ? "" : "s"}
        </Muted>
      </Box>
    )
  }
  return (
    <Text key={key} color="$fg-muted" wrap="wrap">
      {text}
    </Text>
  )
}

/**
 * Render a single ACP `ContentBlock`. Image/audio/resource variants render
 * as a placeholder note — terminals can't display images, but we surface
 * the metadata so the user knows content was emitted.
 *
 * Text blocks with many lines use `renderTextContent` for summary-by-default
 * rendering — see that function's doc for the threshold logic.
 */
function renderContentBlock(block: ContentBlock, key: number | string, summarize = true): React.ReactElement {
  if (block.type === "text") {
    const stream = (block as { stream?: unknown }).stream
    if (stream === "stderr") {
      return (
        <Text key={key} color="$error" wrap="wrap">
          {block.text}
        </Text>
      )
    }
    return renderTextContent(block.text, key, summarize)
  }
  if (block.type === "image") {
    return <Muted key={key}>[image: {block.mimeType}]</Muted>
  }
  if (block.type === "audio") {
    return <Muted key={key}>[audio: {block.mimeType}]</Muted>
  }
  if (block.type === "resource_link") {
    return (
      <Muted key={key}>
        [resource: {block.name} → {block.uri}]
      </Muted>
    )
  }
  // EmbeddedResource — render the inline text if it's a TextResourceContents.
  if ("text" in block.resource) {
    return (
      <Box key={key} flexDirection="column">
        <Muted>resource: {block.resource.uri}</Muted>
        {renderTextContent(block.resource.text, `${key}-body`, summarize)}
      </Box>
    )
  }
  return <Muted key={key}>[blob: {block.resource.uri}]</Muted>
}

/**
 * Per-content-variant body renderer. ACP `ToolCallContent` discriminates on
 * `type`: "content" (text/image/etc.), "diff" (structured diff), "terminal"
 * (live terminal reference). The terminal variant renders as a placeholder
 * in v1 — wiring real terminal playback to a `<TerminalContent>` widget is
 * a follow-up bead.
 */
function renderContent(content: ToolCallContent, key: number, summarize = true): React.ReactElement {
  if (content.type === "content") {
    return <Box key={key}>{renderContentBlock(content.content, key, summarize)}</Box>
  }
  if (content.type === "diff") {
    const hunks = diffContentToHunks(content)
    return (
      <Box key={key} flexDirection="column">
        {content.path.trim().length > 0 ? <Muted>--- {formatPathForDisplay(content.path)}</Muted> : null}
        <SilveryDiff hunks={hunks} mode="unified" showLineNumbers />
      </Box>
    )
  }
  // terminal
  return (
    <Box key={key}>
      <Muted>[terminal: {content.terminalId}]</Muted>
    </Box>
  )
}

function hasVisibleContentBlock(block: ContentBlock): boolean {
  if (block.type === "text") return block.text.trim().length > 0
  if (block.type === "image" || block.type === "audio" || block.type === "resource_link") return true
  if ("text" in block.resource) return block.resource.text.trim().length > 0
  return true
}

function hasVisibleContent(content: ToolCallContent): boolean {
  if (content.type === "content") return hasVisibleContentBlock(content.content)
  if (content.type === "diff") {
    return (
      content.path.trim().length > 0 || (content.oldText ?? "").trim().length > 0 || content.newText.trim().length > 0
    )
  }
  return content.terminalId.trim().length > 0
}

function normalizeDisclosureText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function contentDisclosureText(content: ToolCallContent): string {
  if (content.type === "content") {
    const block = content.content
    if (block.type === "text") return block.text
    if (block.type === "image") return `[image: ${block.mimeType}]`
    if (block.type === "audio") return `[audio: ${block.mimeType}]`
    if (block.type === "resource_link") return `[resource: ${block.name} ${block.uri}]`
    if ("text" in block.resource) return block.resource.text
    return block.resource.uri
  }
  if (content.type === "diff") return `${content.path}\n${content.oldText ?? ""}\n${content.newText}`
  return content.terminalId
}

function hasAdditionalContent(title: string, content: ToolCallContent[]): boolean {
  const titleText = normalizeDisclosureText(title)
  return content.some((c) => {
    if (!hasVisibleContent(c)) return false
    const bodyText = normalizeDisclosureText(contentDisclosureText(c))
    return bodyText.length > 0 && bodyText !== titleText
  })
}

function contentRowEstimate(content: ToolCallContent): number {
  if (content.type === "content") {
    const block = content.content
    if (block.type === "text") return Math.max(1, block.text.split("\n").length)
    if ("resource" in block && "text" in block.resource) return Math.max(1, block.resource.text.split("\n").length + 1)
    return 1
  }
  if (content.type === "diff") {
    return (
      (content.path.trim().length > 0 ? 1 : 0) +
      Math.max(1, (content.oldText ?? "").split("\n").length + content.newText.split("\n").length)
    )
  }
  return 1
}

function ToolCallContentBody({
  content,
  bounded = false,
  summarize = bounded,
}: {
  content: ToolCallContent[]
  bounded?: boolean
  summarize?: boolean
}): React.ReactElement {
  const body = <>{content.map((c, i) => renderContent(c, i, summarize))}</>
  const needsBound = bounded && content.reduce((sum, c) => sum + contentRowEstimate(c), 0) > DEFAULT_DISCLOSURE_MAX_ROWS
  return needsBound ? <BoundedScroll>{body}</BoundedScroll> : <Box flexDirection="column">{body}</Box>
}

function shellExitCode(toolCall: ToolCallType): number | null {
  const input = toolCall.rawInput
  const output = toolCall.rawOutput
  const inputValue = input && typeof input === "object" ? (input as Record<string, unknown>).exit_code : null
  const outputValue = output && typeof output === "object" ? (output as Record<string, unknown>).exitCode : null
  const value = inputValue ?? outputValue
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function titleImagePath(title: string): string | null {
  const viewMatch = title.match(/^View\s+(.+\.(?:png|jpe?g|gif|webp))$/i)
  if (viewMatch?.[1]) return resolveDisplayPath(viewMatch[1])
  const file = detectReferences(title).find(
    (d) => d.kind === "file" && /\.(?:png|jpe?g|gif|webp)$/i.test(d.payload.path ?? ""),
  )
  return file?.kind === "file" ? resolveDisplayPath(file.payload.path ?? "") : null
}

function shellErrorSummary(toolCall: ToolCallType, exitCode: number | null): string | null {
  if (exitCode === null) return null
  const raw = typeof toolCall.title === "string" ? toolCall.title.trim() : ""
  const script = raw.match(/\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?([A-Za-z0-9:_./-]+)/)?.[1]
  const command = script ?? raw.split(/\s+/)[0] ?? "command"
  return `error: ${command} exited with code ${exitCode}`
}

function locationLabel(loc: ToolCallLocation): string {
  const display = formatPathForDisplay(loc.path)
  return loc.line != null ? `${display}:${loc.line}` : display
}

function locationHref(loc: ToolCallLocation): string | null {
  const absolute = resolveDisplayPath(loc.path)
  if (!absolute.startsWith("/")) return null
  const line = loc.line != null ? `:${loc.line}` : ""
  return `file://${absolute}${line}`
}

/**
 * Compact location chip for the header — "src/foo.ts:42" or "src/foo.ts"
 * if no line. Multiple locations render as a comma-separated list,
 * truncating after 3 to keep the header single-row.
 *
 * Absolute paths are tilde-shortened via `formatPathForDisplay` so the
 * chip reads `~vault/RESOLVER.md:42` rather than the literal
 * `/Users/beorn/Bear/Vault/RESOLVER.md:42`. The shortener leaves
 * project-relative paths (`src/foo.ts`) verbatim.
 */
function renderLocations(locations: ReadonlyArray<ToolCallLocation> | undefined): React.ReactElement | null {
  if (!locations || locations.length === 0) return null
  const visible = locations.slice(0, 3)
  const more = locations.length - visible.length
  return (
    <Box flexDirection="row" flexShrink={1} minWidth={0}>
      {visible.map((loc, index) => {
        const label = locationLabel(loc)
        const href = locationHref(loc)
        return (
          <React.Fragment key={`${loc.path}:${loc.line ?? ""}:${index}`}>
            {index > 0 ? <Muted>, </Muted> : null}
            {href ? (
              <Link href={href} color="$muted" wrap="truncate">
                {label}
              </Link>
            ) : (
              <Muted wrap="truncate">{label}</Muted>
            )}
          </React.Fragment>
        )
      })}
      {more > 0 ? <Muted> +{more}</Muted> : null}
    </Box>
  )
}

// =============================================================================
// Component
// =============================================================================

export interface ToolCallProps {
  /** The ACP `ToolCall` to render. */
  toolCall: ToolCallType
  /**
   * When `status === "failed"`, this is the error message rendered by the
   * envelope. Optional — falls back to a generic label. Caller typically
   * extracts the message from `toolCall.rawOutput` or a content block.
   */
  errorMessage?: string
  /**
   * Optional retry hook. Forwarded to `<ToolCallError>` when the call has
   * failed; ignored otherwise.
   */
  onRetry?: () => void
  /**
   * Initial expanded state for the body. Defaults to expanded for failed
   * calls (errors hide nothing) and collapsed otherwise. Caller can flip
   * this to seed a stream as fully-expanded for replay/debug views.
   */
  defaultExpanded?: boolean
  /** Called when the disclosure body opens or closes. */
  onExpandedChange?: (expanded: boolean) => void
  /**
   * When false, render the row as presentational content inside a larger
   * clickable surface. Used by grouped turn summaries so hover/click belongs
   * to the whole group, not each nested tool row.
   */
  interactive?: boolean
  /** When true, shell command titles render as foreground text. */
  titleEmphasis?: "normal" | "muted"
  /** Title wrapping. Normal transcript rows remain single-line; summary detail rows can wrap. */
  titleWrap?: "truncate" | "wrap"
  /** Optional background for the one-cell marker column. */
  markerBackgroundColor?: string
  /** When false, active tool markers stay steady instead of pulsing. */
  animateMarker?: boolean
}

/**
 * Canonical ACP `<ToolCall>` renderer — opencode-style flat row.
 *
 * Structure:
 *   ```
 *   • Read src/foo.ts                               ← always visible row
 *     content from BoundedScroll if hovered/expanded
 *     error message if failed
 *   ```
 *
 * Default-expanded is honored when explicitly set (callers may seed a
 * stream as fully-expanded for replay/debug views). Failed calls keep
 * their body collapsed-by-default but always render the inline error
 * message — failure is signaled by the colour + the message, not by an
 * always-open body.
 */
export function ToolCall({
  toolCall,
  errorMessage,
  onRetry,
  defaultExpanded,
  onExpandedChange,
  interactive = true,
  titleEmphasis = defaultExpanded ? "normal" : "muted",
  titleWrap = "truncate",
  markerBackgroundColor,
  animateMarker = true,
}: ToolCallProps): React.ReactElement {
  const contextMarkerBackgroundColor = React.useContext(ToolMarkerBackgroundContext)
  const forceExpanded = React.useContext(ToolContentForceExpandedContext)
  const markerBg = markerBackgroundColor ?? contextMarkerBackgroundColor
  const status = toolCall.status ?? "pending"
  const kind = toolCall.kind ?? "other"
  const content = toolCall.content ?? []
  const hasContent = hasAdditionalContent(toolCall.title, content)
  const shell = kind === "execute" && !/^View(?:\s|$)/.test(toolCall.title)
  const imagePath = titleImagePath(toolCall.title)
  const exitCode = shell ? shellExitCode(toolCall) : null
  const errorSummary = shell && status === "failed" ? shellErrorSummary(toolCall, exitCode) : null
  const active = status === "in_progress" || status === "pending"
  const markerGlyph = shell ? "$" : active ? "●" : "•"
  const markerColor = status === "failed" ? "$error" : active ? "$info" : "$muted"
  const titleColor = status === "failed" ? "$error" : titleEmphasis === "normal" ? "$fg" : "$muted"
  const titleImagePopoverBody = React.useMemo(
    () =>
      imagePath ? (
        <Box flexDirection="column">
          <Text bold wrap="truncate">
            {imagePath}
          </Text>
          <Image src={imagePath} width={48} height={16} fallback="[image preview]" />
        </Box>
      ) : null,
    [imagePath],
  )

  const rawJsonBlock = React.useMemo(() => {
    if (!interactive || forceExpanded) return null
    if (toolCall.rawInput === undefined && toolCall.rawOutput === undefined) return null
    const payload: Record<string, unknown> = { name: toolCall.title, kind, status }
    if (toolCall.rawInput !== undefined) payload.input = toolCall.rawInput
    if (toolCall.rawOutput !== undefined) payload.output = toolCall.rawOutput
    let serialized: string
    try {
      serialized = JSON.stringify(payload, null, 2)
    } catch {
      serialized = "[unserializable raw payload]"
    }
    return (
      <Box flexDirection="column" marginTop={1}>
        <Muted>Raw event</Muted>
        <Text wrap="wrap" color="$muted">
          {serialized}
        </Text>
      </Box>
    )
  }, [interactive, forceExpanded, toolCall.rawInput, toolCall.rawOutput, toolCall.title, kind, status])

  const previewPopover =
    interactive && !forceExpanded && imagePath && titleImagePopoverBody
      ? {
          body: (
            <Box flexDirection="column">
              {titleImagePopoverBody}
              {rawJsonBlock}
            </Box>
          ),
          maxWidth: 100,
        }
      : interactive && !forceExpanded && hasContent
        ? {
            body: (
              <Box flexDirection="column">
                {exitCode !== null ? <Muted>Exit code {exitCode}</Muted> : null}
                <ToolCallContentBody content={content} bounded />
                {rawJsonBlock}
              </Box>
            ),
            maxWidth: 100,
          }
        : interactive && !forceExpanded && rawJsonBlock
          ? { body: <Box flexDirection="column">{rawJsonBlock}</Box>, maxWidth: 100 }
          : null

  return (
    <EntryDisclosure
      popover={previewPopover}
      defaultExpanded={defaultExpanded ?? false}
      onExpandedChange={onExpandedChange}
      interactive={interactive}
      canExpand={hasContent}
    >
      {({ surfaceProps, isHovered, expanded, toggleExpanded, collapse }) => {
        const effectiveExpanded = expanded || forceExpanded
        const onSurfaceClick =
          surfaceProps.onClick && interactive && hasContent
            ? (e: SilveryMouseEvent): void => {
                e.stopPropagation()
                surfaceProps.onClick?.(e)
              }
            : surfaceProps.onClick
        const onAttachedClick = (e: SilveryMouseEvent): void => {
          e.stopPropagation()
          if (interactive && hasContent) collapse()
        }
        const armedBg =
          interactive && hasContent && isHovered
            ? "$bg-surface-hover"
            : effectiveExpanded && hasContent
              ? "$bg-surface-subtle"
              : undefined

        return (
          <Box
            flexDirection="row"
            gap={1}
            width="100%"
            backgroundColor={armedBg}
            {...surfaceProps}
            onClick={onSurfaceClick}
          >
            <Box width={1} flexShrink={0} backgroundColor={markerBg}>
              <StatusGlyph glyph={markerGlyph} active={active && animateMarker} color={markerColor} period={1800} />
            </Box>

            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              {/* Always-visible row — single line, no border, no per-tool color.
                  The marker is a section marker; title and expanded output share
                  this content column's left edge. */}
              <Box flexDirection="row" gap={1} width="100%">
                <ToolCallStatusTitle
                  status={status}
                  kind={kind}
                  title={shortenTitlePath(toolCall.title)}
                  shell={shell}
                  color={titleColor}
                  linkify={!shell}
                  wrap={titleWrap}
                />
                {renderLocations(toolCall.locations)}
                <Box
                  flexGrow={1}
                  height={1}
                  onClick={(e: SilveryMouseEvent) => {
                    e.stopPropagation()
                    if (interactive && hasContent) toggleExpanded()
                  }}
                >
                  <Text> </Text>
                </Box>
                {status === "failed" && onRetry ? (
                  <Box onClick={onRetry}>
                    <Muted>↻ retry</Muted>
                  </Box>
                ) : null}
              </Box>

              {/* Body reveals only when clicked (or initially via defaultExpanded).
                  It is aligned with the command/title, not with the marker. */}
              {effectiveExpanded && hasContent ? (
                <Box flexDirection="column" onClick={onAttachedClick}>
                  <ToolCallContentBody content={content} bounded summarize={false} />
                </Box>
              ) : null}
              {/* Failed calls inline the error message immediately under the row.
                  No border, no bg, and no red tool color; shell failures read as
                  command + inline stderr. */}
              {status === "failed" ? (
                <Box flexDirection="column">
                  <Text color="$error" wrap="wrap">
                    {errorSummary ?? errorMessage ?? "Tool call failed"}
                  </Text>
                  {errorSummary &&
                  errorMessage &&
                  normalizeDisclosureText(errorMessage) !== normalizeDisclosureText(errorSummary) ? (
                    <Text color="$error" wrap="wrap">
                      {errorMessage}
                    </Text>
                  ) : null}
                </Box>
              ) : null}
            </Box>
          </Box>
        )
      }}
    </EntryDisclosure>
  )
}
