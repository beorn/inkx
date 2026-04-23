/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
import React, { useCallback, useRef, useState } from "react"
import { Box, Text } from "silvery"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { colorize } from "./colorize.tsx"
import { usePopover, type PopoverContent } from "./Popover.tsx"
import type { FieldSpec, LogRow as LogRowData } from "./view-config.ts"

function resolve<T>(
  v: T | ((value: unknown, row: LogRowData) => T) | undefined,
  value: unknown,
  row: LogRowData,
): T | undefined {
  if (typeof v === "function") {
    return (v as (value: unknown, row: LogRowData) => T)(value, row)
  }
  return v
}

function valueToString(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/**
 * Row shape:
 *   Line 1 (header):   [time]  [ KIND-pill ]  [ label-pill ]  [ inline-body? ]
 *   Lines 2+ (body):   one row per body line, dim muted, indented 2, with inline
 *                      tag/JSON colorization via colorize(). Body lines wrap
 *                      naturally (wrap="wrap") so long content stays visible.
 *
 * Interactions (redesigned 2026-04-23):
 *   - Hover on pill → popover shows the pill's full/raw value
 *   - Click on row → toggles per-row expanded state when there's multi-line
 *     body. Collapsed shows first BODY_COLLAPSED_MAX_LINES + "+N more (click
 *     to expand)"; expanded shows every line. No body-level popover — the
 *     inline expansion is the way to see full content.
 *
 * Pills (kind/label): colored bold text + hover popover when rendered differs
 * from raw (e.g. USER vs user).
 * Separator: a single space — pill shape + color carries the visual boundary.
 *
 * When a `multiLine: "below"` field contains ANY newline OR exceeds
 * INLINE_BODY_MAX_CHARS, the whole body pushes below the header.
 *
 * Selection (Omnibox pattern): row Box gets $bg-cursor; Text falls back to
 * $fg-cursor for contrast. Pill bgs collapse to cursor fg for unity.
 */

const PILL_FIELDS = new Set(["kind", "label"])

/** Inline single-line body threshold. Below this many chars → inline with
 * the header; at/above, or any multi-line content → push below muted+dim. */
const INLINE_BODY_MAX_CHARS = 30

/** Produce popover content for a field value. */
function fieldPopoverContent(
  fieldKey: string,
  fieldLabel: string | undefined,
  rawValue: unknown,
  rendered: string,
): PopoverContent {
  const title = fieldLabel ?? fieldKey
  // Prefer the RAW value for popover (so users see the unrendered data for
  // pills that transform the content, e.g. "user" → "USER"). Fall back to
  // rendered when raw is non-stringy.
  const source = typeof rawValue === "string" ? rawValue : rendered
  const lines = source.length === 0 ? ["(empty)"] : source.split("\n")
  return { title, lines, maxWidth: 80 }
}

/** Hover dwell before showing a popover — short enough to feel responsive,
 * long enough that casual cursor transits don't flash a popover. */
const HOVER_SHOW_DELAY_MS = 500

/**
 * Hook: returns { onMouseEnter, onMouseLeave } handlers that show a popover
 * after HOVER_SHOW_DELAY_MS of dwell and hide on leave. Consumers spread
 * the handlers onto whichever host element they render (Text or Box) —
 * this avoids the Box-inside-Text nesting restriction.
 *
 * Dwell semantics: enter starts the timer; leave cancels any pending show
 * AND hides an already-visible popover via the provider's grace window.
 */
function usePopoverHandlers(content: PopoverContent) {
  const popover = usePopover()
  const pendingShowRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPending = useCallback(() => {
    if (pendingShowRef.current) {
      clearTimeout(pendingShowRef.current)
      pendingShowRef.current = null
    }
  }, [])

  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      if (!popover) return
      // Capture the anchor eagerly — `e` is pooled and may be invalidated
      // by the time the timer fires.
      const anchor = { x: e.clientX, y: e.clientY }
      clearPending()
      pendingShowRef.current = setTimeout(() => {
        pendingShowRef.current = null
        popover.show(content, anchor)
      }, HOVER_SHOW_DELAY_MS)
    },
    [popover, content, clearPending],
  )
  const onMouseLeave = useCallback(
    (e: SilveryMouseEvent) => {
      if (!popover) return
      e.stopPropagation()
      clearPending()
      popover.hide()
    },
    [popover, clearPending],
  )
  return { onMouseEnter, onMouseLeave }
}

/**
 * HoverTarget wraps inline content in a <Text> with popover hover handlers.
 * Use for single-line segments (pills, truncated strings). For multi-line
 * content (stacked body lines), call usePopoverHandlers directly and attach
 * the handlers to a <Box>.
 */
function HoverTarget({ content, children }: { content: PopoverContent; children: React.ReactNode }) {
  const handlers = usePopoverHandlers(content)
  return <Text {...handlers}>{children}</Text>
}

/**
 * Decide whether a header segment has "hidden" content worth a popover.
 *
 * Rule: if the rendered string equals the raw string value, nothing is
 * hidden — suppress the popover. Pills whose render() transforms the value
 * (kind: "user" → "USER") legitimately have hidden data (the raw key name)
 * and keep the popover. Identity renders (label passing through verbatim,
 * timestamps) don't.
 *
 * For non-string raw values (objects, numbers), we always allow the popover:
 * the rendered form is necessarily a projection of the raw structure.
 */
function hasHiddenContent(rendered: string, raw: unknown): boolean {
  if (typeof raw !== "string") return true
  return rendered !== raw
}

function Pill({
  color,
  bold,
  isCursor,
  children,
}: {
  color: string | undefined
  bold: boolean
  isCursor: boolean
  children: React.ReactNode
}) {
  // Pills are "groupings with a name" — rendered as plain colored bold text.
  // Shape carries meaning via content (KIND, label) + surrounding spacing.
  return (
    <Text color={isCursor ? "$fg-cursor" : color} bold={bold || undefined}>
      {children}
    </Text>
  )
}

/** Inline component: collapsed multi-line body preview. Lines wrap
 * naturally; a "+N more (click to expand)" tail indicates hidden content.
 *
 * Hover: entering anywhere on the preview brightens ONLY the "+more"
 * indicator (un-dim + underline) — the body lines stay subdued so the call
 * to action doesn't visually drown the content. */
function CollapsedBodyPreview({
  lines,
  remainder,
  isCursor,
  bodyColor,
}: {
  lines: string[]
  remainder: number
  isCursor: boolean
  bodyColor: string
}) {
  const [hovered, setHovered] = useState(false)
  const onMouseEnter = useCallback(() => setHovered(true), [])
  const onMouseLeave = useCallback(() => setHovered(false), [])
  return (
    <Box flexDirection="column" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {lines.map((line, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
          key={`c${i}`}
          color={bodyColor}
          dim={!isCursor}
          wrap="wrap"
        >
          <Text>{"  "}</Text>
          {colorize(line)}
        </Text>
      ))}
      {remainder > 0 && (
        // Only the "+N more" indicator brightens on hover — body lines stay
        // subdued so the call-to-action stands out. Bright default fg + bold
        // on hover; no underline (per user spec).
        <Text
          color={hovered ? "$fg" : "$fg-muted"}
          dim={!isCursor && !hovered}
          bold={hovered || undefined}
        >
          {`  ⋯ +${remainder} more (click to expand)`}
        </Text>
      )}
    </Box>
  )
}

export function LogRowView({
  row,
  fields,
  isCursor,
  expanded,
  onToggleExpand,
}: {
  row: LogRowData
  fields: FieldSpec[]
  isCursor: boolean
  expanded: boolean
  onToggleExpand: () => void
}) {
  const headerSegments: React.ReactNode[] = []
  let bodyLines: string[] = []
  let bodyFieldKey: string | null = null
  const cursorFg = "$fg-cursor"

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    const raw = row.fields[field.key]
    const color = resolve(field.color, raw, row)
    const bold = resolve(field.bold, raw, row) ?? false
    const rendered = field.render ? field.render(raw, row) : valueToString(raw)
    const asStr = typeof rendered === "string" ? rendered : null

    // Body-like fields (multiLine:"below"): go below when there are 2+
    // non-empty lines OR the single line is ≥ INLINE_BODY_MAX_CHARS. Short
    // single-liners render inline beside the header. Keep the styling
    // uniform: body is always dim-muted + colorized, never per-kind.
    let inlineBody: string | null = null
    if (field.multiLine === "below" && asStr !== null && asStr.length > 0) {
      const allLines = asStr.split("\n")
      const nonEmpty = allLines.filter((l) => l.trim().length > 0)
      const single = nonEmpty[0] ?? ""
      if (nonEmpty.length > 1 || single.length >= INLINE_BODY_MAX_CHARS) {
        bodyLines = allLines
        bodyFieldKey = field.key
        continue
      }
      inlineBody = single
      if (inlineBody === "") continue
    }

    if (inlineBody === null && (rendered == null || rendered === "")) continue

    // We only attach a popover when the segment ACTUALLY has hidden content:
    // rendered ≠ raw (pill transform, truncation, escape) or raw isn't
    // stringy (object projection). Identity renders get no popover — it's
    // noise on content the user can already see in full. (Bug 1)
    //   - Pill (kind): rendered "USER" vs raw "user" → hidden ✓
    //   - Pill (label): render is identity → no popover
    //   - Plain (time): identity → no popover
    //   - Inline body (short single-liner): compare the rendered inline slice
    //     to the FULL raw body, because inlineBody is first-non-empty-line
    //     which may hide leading/trailing blank lines from the raw value.
    const renderedSurface = inlineBody !== null ? inlineBody : (asStr ?? "")
    const popContent =
      asStr !== null && hasHiddenContent(renderedSurface, raw)
        ? fieldPopoverContent(field.key, field.label, raw, asStr)
        : null

    // Pills → pill rendering wrapped in a HoverTarget for popover.
    // Body inline → dim-muted + colorize. Non-pill header fields without
    // hidden content render without a hover target at all.
    if (PILL_FIELDS.has(field.key)) {
      const pill = (
        <Pill key={field.key} color={color} bold={bold} isCursor={isCursor}>
          {rendered}
        </Pill>
      )
      headerSegments.push(
        popContent ? (
          <HoverTarget key={field.key} content={popContent}>
            {pill}
          </HoverTarget>
        ) : (
          pill
        ),
      )
    } else if (inlineBody !== null) {
      const segment = (
        <Text key={field.key} color={isCursor ? cursorFg : "$fg-muted"} dim={!isCursor}>
          {colorize(inlineBody)}
        </Text>
      )
      headerSegments.push(
        popContent ? (
          <HoverTarget key={field.key} content={popContent}>
            {segment}
          </HoverTarget>
        ) : (
          segment
        ),
      )
    } else {
      const segment = (
        <Text key={field.key} color={isCursor ? cursorFg : color} bold={bold || isCursor || undefined}>
          {rendered}
        </Text>
      )
      headerSegments.push(
        popContent ? (
          <HoverTarget key={field.key} content={popContent}>
            {segment}
          </HoverTarget>
        ) : (
          segment
        ),
      )
    }

    if (i < fields.length - 1) {
      headerSegments.push(<Text key={`sep-${field.key}`}> </Text>)
    }
  }

  const bodyColor = isCursor ? cursorFg : "$fg-muted"
  const hasBody = bodyLines.length > 0

  // Collapsed preview: first BODY_COLLAPSED_MAX_LINES + "+K more" tail.
  // Only collapsible when collapsing actually HIDES more than one line —
  // hiding a single line behind "+1 more" (click to reveal 1 line) is a
  // net loss, so below that threshold we just show everything and skip the
  // expand/collapse affordance entirely (no bg tint, click does nothing).
  const BODY_COLLAPSED_MAX_LINES = 3
  // Strip trailing blank lines only — preserve interior blanks so structure
  // (e.g. paragraph breaks in an assistant message) stays visible.
  const trimmedBodyLines = hasBody ? bodyLines.slice() : []
  while (trimmedBodyLines.length > 0 && trimmedBodyLines[trimmedBodyLines.length - 1]!.trim().length === 0) {
    trimmedBodyLines.pop()
  }
  // Collapse only when hiding > 1 line would be saved. Otherwise show all.
  const isCollapsible = trimmedBodyLines.length > BODY_COLLAPSED_MAX_LINES + 1
  const collapsedLines = isCollapsible
    ? trimmedBodyLines.slice(0, BODY_COLLAPSED_MAX_LINES)
    : trimmedBodyLines
  const collapsedRemainder = isCollapsible
    ? trimmedBodyLines.length - BODY_COLLAPSED_MAX_LINES
    : 0

  // No body-level popover — body is shown inline. Click toggles expand
  // only when the body is actually collapsible. bodyFieldKey is unused
  // now that there's no popover (was the popover title).
  void bodyFieldKey

  // Row-level click: toggle expansion only when there's something to hide.
  // A body that fits in collapsed view (≤ threshold+1 lines) isn't
  // toggleable — click has no visual effect.
  const onBoxClick = useCallback(
    (e: SilveryMouseEvent) => {
      if (!isCollapsible) return
      e.stopPropagation()
      onToggleExpand()
    },
    [isCollapsible, onToggleExpand],
  )

  // Show expanded body (with subtle bg) only when the body is actually
  // collapsible AND the user has expanded. If not collapsible, render the
  // body flat (no bg tint, no click affordance).
  const showExpanded = isCollapsible && expanded
  const showCollapsed = isCollapsible && !expanded
  const showFlat = hasBody && !isCollapsible

  // Row bg cascade (most → least specific):
  //   cursor row     → $bg-cursor (strong selection indicator)
  //   expanded row   → $bg-surface-subtle (whole-row tint signals
  //                    "expanded" state, carries through header + body)
  //   otherwise      → terminal default (no bg)
  const rowBackground = isCursor
    ? "$bg-cursor"
    : showExpanded
      ? "$bg-surface-subtle"
      : undefined

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      width="100%"
      backgroundColor={rowBackground}
      onClick={onBoxClick}
    >
      <Text wrap="truncate-end">{headerSegments}</Text>
      {showCollapsed && (
        <CollapsedBodyPreview
          lines={collapsedLines}
          remainder={collapsedRemainder}
          isCursor={isCursor}
          bodyColor={bodyColor}
        />
      )}
      {showExpanded &&
        bodyLines.map((line, i) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
            key={`b${i}`}
            color={bodyColor}
            dim={!isCursor}
            wrap="wrap"
          >
            <Text>{"  "}</Text>
            {colorize(line)}
          </Text>
        ))}
      {showFlat &&
        trimmedBodyLines.map((line, i) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
            key={`f${i}`}
            color={bodyColor}
            dim={!isCursor}
            wrap="wrap"
          >
            <Text>{"  "}</Text>
            {colorize(line)}
          </Text>
        ))}
    </Box>
  )
}
