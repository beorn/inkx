/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/** Main row renderer: header (pills + inline fields) on one line, optional body below with collapsible preview + click-to-toggle expansion. */
import React, { useCallback } from "react"
import { Box, Text, useSearch, useWindowSize } from "silvery"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { colorize } from "../colorize.tsx"
import type { FieldSpec, LogRow as LogRowData } from "../view-config.ts"
import { CollapsedBodyPreview } from "./CollapsedBodyPreview.tsx"
import { BODY_COLLAPSED_MAX_LINES, BODY_INDENT, INLINE_BODY_FIT_MARGIN, PILL_FIELDS } from "./constants.ts"
import { highlight } from "./highlight.tsx"
import { HoverTarget } from "./HoverTarget.tsx"
import { Pill } from "./Pill.tsx"
import { fieldPopoverContent, hasHiddenContent } from "./popover-content.ts"

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
 * When a `multiLine: "below"` field contains ANY newline, or its single
 * line doesn't fit alongside the header in the current terminal width, the
 * whole body pushes below. Fit is measured against actual `columns`, not
 * a fixed character threshold — so a 40-char body inlines on a 200-col
 * terminal but pushes below on an 80-col one.
 *
 * Selection (Omnibox pattern): row Box gets $bg-cursor; Text falls back to
 * $fg-cursor for contrast. Pill bgs collapse to cursor fg for unity.
 */
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
  const { columns } = useWindowSize()
  // Active search query — used to highlight matching substrings in every
  // rendered string (pill labels, inline body, body lines). Empty when no
  // search is active.
  const searchCtx = useSearch()
  const searchQuery = searchCtx?.query ?? ""

  // Running count of characters consumed by header segments so far.
  // Used to decide whether a single-line body can fit on the same line
  // as the header, vs push below. Updated after each segment is pushed.
  let headerCharWidth = 0
  // Outer Box uses paddingX={1} → 2 cols reserved (left + right).
  const PADDING_X = 2

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    const raw = row.fields[field.key]
    const color = resolve(field.color, raw, row)
    const bold = resolve(field.bold, raw, row) ?? false
    const rendered = field.render ? field.render(raw, row) : valueToString(raw)
    const asStr = typeof rendered === "string" ? rendered : null

    // Body-like fields (multiLine:"below"): multi-line content always
    // pushes below. For single-line bodies we inline ONLY when the line
    // still fits within the terminal width (header + separator + body
    // + padding + safety margin). This replaces the old fixed
    // INLINE_BODY_MAX_CHARS=30 heuristic — now a 40-char body inlines
    // fine on a 200-col terminal but pushes below on an 80-col one.
    let inlineBody: string | null = null
    if (field.multiLine === "below" && asStr !== null && asStr.length > 0) {
      const allLines = asStr.split("\n")
      const nonEmpty = allLines.filter((l) => l.trim().length > 0)
      const single = nonEmpty[0] ?? ""
      if (nonEmpty.length > 1) {
        bodyLines = allLines
        bodyFieldKey = field.key
        continue
      }
      const sepBeforeBody = headerCharWidth > 0 ? 1 : 0
      const availableWidth = Math.max(0, columns - PADDING_X - headerCharWidth - sepBeforeBody - INLINE_BODY_FIT_MARGIN)
      if (single.length > availableWidth) {
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
    // When a search query is active, render matching substrings highlighted.
    // Skip colorize on matched lines (the highlight is the important
    // visual cue; colorize can resume when the search clears).
    const activeQuery = searchQuery
    const hasMatch = (s: string) => activeQuery !== "" && s.toLowerCase().includes(activeQuery.toLowerCase())

    if (PILL_FIELDS.has(field.key)) {
      const pill = (
        <Pill key={field.key} color={color} bold={bold} isCursor={isCursor}>
          {hasMatch(rendered as string) ? highlight(rendered as string, activeQuery) : rendered}
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
          {hasMatch(inlineBody) ? highlight(inlineBody, activeQuery) : colorize(inlineBody)}
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
          {hasMatch(rendered as string) ? highlight(rendered as string, activeQuery) : rendered}
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

    // Track the rendered width so the next field's inline-fit check sees
    // the correct column offset. inlineBody was the single body line;
    // otherwise use the rendered string (asStr) or stringified non-string.
    const segmentWidth =
      inlineBody !== null ? inlineBody.length : asStr !== null ? asStr.length : String(rendered ?? "").length
    headerCharWidth += segmentWidth
    if (i < fields.length - 1) {
      headerSegments.push(<Text key={`sep-${field.key}`}> </Text>)
      headerCharWidth += 1
    }
  }

  const bodyColor = isCursor ? cursorFg : "$fg-muted"
  const hasBody = bodyLines.length > 0

  // Collapsed preview: first BODY_COLLAPSED_MAX_LINES + "+K more" tail.
  // Only collapsible when collapsing actually HIDES more than one line —
  // hiding a single line behind "+1 more" (click to reveal 1 line) is a
  // net loss, so below that threshold we just show everything and skip the
  // expand/collapse affordance entirely (no bg tint, click does nothing).
  // Strip trailing blank lines only — preserve interior blanks so structure
  // (e.g. paragraph breaks in an assistant message) stays visible.
  const trimmedBodyLines = hasBody ? bodyLines.slice() : []
  while (trimmedBodyLines.length > 0 && trimmedBodyLines[trimmedBodyLines.length - 1]!.trim().length === 0) {
    trimmedBodyLines.pop()
  }
  // Collapse only when hiding > 1 line would be saved. Otherwise show all.
  const isCollapsible = trimmedBodyLines.length > BODY_COLLAPSED_MAX_LINES + 1
  const collapsedLines = isCollapsible ? trimmedBodyLines.slice(0, BODY_COLLAPSED_MAX_LINES) : trimmedBodyLines
  const collapsedRemainder = isCollapsible ? trimmedBodyLines.length - BODY_COLLAPSED_MAX_LINES : 0

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
  const rowBackground = isCursor ? "$bg-cursor" : showExpanded ? "$bg-surface-subtle" : undefined

  return (
    <Box flexDirection="column" paddingX={1} width="100%" backgroundColor={rowBackground} onClick={onBoxClick}>
      <Text wrap="truncate-end">{headerSegments}</Text>
      {showCollapsed && (
        <CollapsedBodyPreview
          lines={collapsedLines}
          remainder={collapsedRemainder}
          isCursor={isCursor}
          bodyColor={bodyColor}
          searchQuery={searchQuery}
        />
      )}
      {showExpanded && (
        <Box flexDirection="column" paddingLeft={BODY_INDENT}>
          {bodyLines.map((line, i) => {
            const showHighlight = searchQuery !== "" && line.toLowerCase().includes(searchQuery.toLowerCase())
            return (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
                key={`b${i}`}
                color={bodyColor}
                dim={!isCursor}
                wrap="wrap"
              >
                {showHighlight ? highlight(line, searchQuery) : colorize(line)}
              </Text>
            )
          })}
        </Box>
      )}
      {showFlat && (
        <Box flexDirection="column" paddingLeft={BODY_INDENT}>
          {trimmedBodyLines.map((line, i) => {
            const showHighlight = searchQuery !== "" && line.toLowerCase().includes(searchQuery.toLowerCase())
            return (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
                key={`f${i}`}
                color={bodyColor}
                dim={!isCursor}
                wrap="wrap"
              >
                {showHighlight ? highlight(line, searchQuery) : colorize(line)}
              </Text>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
