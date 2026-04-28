/**
 * <ToolCall>
 *
 * Canonical ACP `ToolCall` renderer — opencode-style flat row.
 *
 * Visual contract (v2, bead km-silvercode.tool-call-rendering-v2):
 *   - One single line per call. NO border, NO bg color on the row.
 *   - Format: `→ <title>` where `→` (U+2192) is a literal arrow glyph.
 *   - Verb token (the title) is colored by tool kind via semantic tokens:
 *       read / search / fetch  → `$info`     (calm cyan)
 *       edit / move            → `$success`  (calm green)
 *       execute                → `$muted`    (neutral)
 *       think / other          → `$accent`   (subtle highlight)
 *       failed (any kind)      → `$error`    (red)
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
 *   - <ToolCallStatusTitle>  — kind-coloured title with shimmer/reveal animations
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
import { Accordion, Box, Diff as SilveryDiff, type DiffHunk, Muted, Spinner, Text, useHover } from "silvery"
import type {
  ToolCall as ToolCallType,
  ToolCallContent,
  ToolCallLocation,
  ContentBlock,
  ToolKind,
} from "@km/agent-harness"
import { ToolCallStatusTitle } from "./ToolCallStatusTitle.tsx"
import { BoundedScroll } from "./BoundedScroll.tsx"
import { formatPathForDisplay } from "../utils/format-path.ts"

// =============================================================================
// Constants — summarization thresholds
// =============================================================================

/**
 * Text blocks with more than this many lines get summarized: the first
 * SUMMARY_PREVIEW_LINES are shown inline; the rest are tucked behind an
 * Accordion so the user can expand on demand.
 *
 * Rationale: a `ls` of a 28-file directory should not dump 28 lines inline.
 * Native Claude Code renders "Listed 1 directory" — we match that terse
 * spirit while still making the full output accessible with one click.
 */
const SUMMARY_THRESHOLD = 5

/** Lines shown verbatim before the "N more lines" accordion. */
const SUMMARY_PREVIEW_LINES = 3

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
function diffContentToHunks(content: { newText: string; oldText?: string | null }): DiffHunk[] {
  const oldLines = (content.oldText ?? "").split("\n")
  const newLines = content.newText.split("\n")
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
 * Render a long text block with summary-by-default behaviour.
 *
 * If the text has more than SUMMARY_THRESHOLD lines, only the first
 * SUMMARY_PREVIEW_LINES are shown inline. The remaining lines are hidden
 * behind a silvery `<Accordion>` with title "N more lines" (collapsed by
 * default). The user can press Enter / click to expand.
 *
 * Short texts (≤ SUMMARY_THRESHOLD lines) render verbatim — no accordion.
 */
function renderTextContent(text: string, key: number | string): React.ReactElement {
  const lines = text.split("\n")
  if (lines.length <= SUMMARY_THRESHOLD) {
    return (
      <Text key={key} wrap="wrap">
        {text}
      </Text>
    )
  }
  // Long text: preview + accordion for the remainder.
  const preview = lines.slice(0, SUMMARY_PREVIEW_LINES)
  const rest = lines.slice(SUMMARY_PREVIEW_LINES)
  const moreCount = rest.length
  return (
    <Box key={key} flexDirection="column">
      {preview.map((line, i) => (
        <Text key={i} wrap="wrap">
          {line}
        </Text>
      ))}
      <Accordion title={`${moreCount} more line${moreCount === 1 ? "" : "s"}`}>
        <BoundedScroll>
          {rest.map((line, i) => (
            <Text key={i} wrap="wrap">
              {line}
            </Text>
          ))}
        </BoundedScroll>
      </Accordion>
    </Box>
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
function renderContentBlock(block: ContentBlock, key: number | string): React.ReactElement {
  if (block.type === "text") {
    return renderTextContent(block.text, key)
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
        {renderTextContent(block.resource.text, `${key}-body`)}
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
function renderContent(content: ToolCallContent, key: number): React.ReactElement {
  if (content.type === "content") {
    return <Box key={key}>{renderContentBlock(content.content, key)}</Box>
  }
  if (content.type === "diff") {
    const hunks = diffContentToHunks(content)
    return (
      <Box key={key} flexDirection="column">
        <Muted>--- {formatPathForDisplay(content.path)}</Muted>
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
  const text = visible
    .map((loc) => {
      const display = formatPathForDisplay(loc.path)
      return loc.line != null ? `${display}:${loc.line}` : display
    })
    .join(", ")
  return (
    <Box flexShrink={1} minWidth={0}>
      <Muted wrap="truncate">
        {text}
        {more > 0 ? ` +${more}` : ""}
      </Muted>
    </Box>
  )
}

/**
 * Map ACP `ToolKind` to a semantic theme token for the verb token color.
 *
 * Failed status is handled by the caller (always `$error`, regardless of kind)
 * so this function only returns the idle-success palette. Tokens chosen
 * to match opencode's calm density:
 *
 *   read / search / fetch  → `$info`     (calm cyan — passive observation)
 *   edit / move            → `$success`  (calm green — successful mutation)
 *   execute                → `$muted`    (neutral — shell commands have noisy
 *                                          output; muting the verb keeps focus
 *                                          on the command text itself)
 *   think                  → `$accent`   (subtle highlight)
 *   delete                 → `$error`    (red — destructive)
 *   switch_mode / other    → `$accent`
 *
 * `$warning` is intentionally NOT used for any idle/success state — yellow
 * was the loud color the v1 redesign explicitly removed.
 */
function kindColor(kind: ToolKind): string {
  switch (kind) {
    case "read":
    case "search":
    case "fetch":
      return "$info"
    case "edit":
    case "move":
      return "$success"
    case "execute":
      return "$muted"
    case "think":
      return "$accent"
    case "delete":
      return "$error"
    default:
      return "$accent"
  }
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
}

/**
 * Canonical ACP `<ToolCall>` renderer — opencode-style flat row.
 *
 * Structure:
 *   ```
 *   → src/foo.ts                                    ← always visible row
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
export function ToolCall({ toolCall, errorMessage, onRetry, defaultExpanded }: ToolCallProps): React.ReactElement {
  const status = toolCall.status ?? "pending"
  const kind = toolCall.kind ?? "other"
  const hasContent = (toolCall.content?.length ?? 0) > 0

  // Hover drives body reveal. `defaultExpanded` (when explicitly set) wins
  // over hover so test fixtures and replay views can pin the body open.
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const expanded = defaultExpanded ?? isHovered

  // Verb colour: red for any failure, kind-mapped semantic token otherwise.
  // No `$warning` — yellow was the loud colour the redesign removed.
  const verbColor = status === "failed" ? "$error" : kindColor(kind)

  return (
    <Box flexDirection="column" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {/* Always-visible row — single line, NO border, NO bg. The leading `→`
          glyph anchors the row visually; the title carries the meaning;
          `kindColor` gives the verb a subtle hue. Status (in_progress) is
          conveyed by `<ToolCallStatusTitle>`'s shimmer wrapper, not by a
          separate glyph — opencode emits no spinner / ✓ / ✗ here either. */}
      <Box flexDirection="row" gap={1}>
        <Text color={verbColor}>→</Text>
        {status === "in_progress" ? (
          // Spinner is paired with the title for in-progress signal — small,
          // unobtrusive, and matches opencode's mid-task signal.
          <Spinner type="dots" />
        ) : null}
        <ToolCallStatusTitle status={status} kind={kind} title={shortenTitlePath(toolCall.title)} color={verbColor} />
        {renderLocations(toolCall.locations)}
        <Box flexGrow={1} />
        {status === "failed" && onRetry ? (
          <Box onClick={onRetry}>
            <Muted>↻ retry</Muted>
          </Box>
        ) : null}
      </Box>
      {/* Body reveals on hover (or when defaultExpanded). Indent 2 cols, dim
          fg, no border, no bg. Tight density — opencode emits tool output as
          plain text in the chat scrollback. */}
      {expanded && hasContent ? (
        <Box paddingLeft={2} flexDirection="column">
          <BoundedScroll>{(toolCall.content ?? []).map((c, i) => renderContent(c, i))}</BoundedScroll>
        </Box>
      ) : null}
      {/* Failed calls inline the error message immediately under the row.
          No border, no bg — the `$error` colour on the verb plus the
          message body carries the failure signal. */}
      {status === "failed" ? (
        <Box paddingLeft={2} flexDirection="column">
          <Text color="$error" wrap="wrap">
            {errorMessage ?? "Tool call failed"}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
