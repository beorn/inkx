/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/** Main row renderer: header (pills + inline fields) on one line, optional body below with collapsible preview + click-to-toggle expansion. */
import React, { useCallback } from "react"
import { Box, Text, useSearch, useWindowSize } from "silvery"
import type { SilveryMouseEvent } from "silvery/term"
import { colorize } from "../colorize.tsx"
import type { PopoverContent } from "../Popover.tsx"
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

/** Whether a rendered string contains `query` (case-insensitive). Empty query = no match. */
function hasMatch(s: string, query: string): boolean {
  return query !== "" && s.toLowerCase().includes(query.toLowerCase())
}

/** Wrap `node` in a HoverTarget when `popContent` is non-null, else return the node. */
function withHover(popContent: PopoverContent | null, key: string, node: React.ReactElement): React.ReactElement {
  if (popContent === null) return node
  return (
    <HoverTarget key={key} content={popContent}>
      {node}
    </HoverTarget>
  )
}

/** Body layout decision: does this "below"-field's content fit alongside the header? */
type InlineFitInput = {
  allLines: string[]
  headerCharWidth: number
  columns: number
}

/** Returns either an inline single-line body string OR `null` meaning "push below". */
function computeInlineFit({ allLines, headerCharWidth, columns }: InlineFitInput): string | null {
  const nonEmpty = allLines.filter((l) => l.trim().length > 0)
  if (nonEmpty.length > 1) return null
  const single = nonEmpty[0] ?? ""
  const PADDING_X = 2 // outer Box paddingX={1} → 2 cols reserved
  const sepBeforeBody = headerCharWidth > 0 ? 1 : 0
  const availableWidth = Math.max(0, columns - PADDING_X - headerCharWidth - sepBeforeBody - INLINE_BODY_FIT_MARGIN)
  if (single.length > availableWidth) return null
  return single
}

type SegmentContext = {
  isCursor: boolean
  cursorFg: string
  searchQuery: string
}

/** Build the pill segment for a header field (kind/label). */
function renderPillSegment(
  field: FieldSpec,
  rendered: React.ReactNode,
  color: string | undefined,
  bold: boolean,
  popContent: PopoverContent | null,
  ctx: SegmentContext,
): React.ReactElement {
  const content =
    typeof rendered === "string" && hasMatch(rendered, ctx.searchQuery)
      ? highlight(rendered, ctx.searchQuery)
      : rendered
  const pill = (
    <Pill key={field.key} color={color} bold={bold} isCursor={ctx.isCursor}>
      {content}
    </Pill>
  )
  return withHover(popContent, field.key, pill)
}

/** Build an inline-body header segment (single-line body that fits). */
function renderInlineBodySegment(
  field: FieldSpec,
  inlineBody: string,
  popContent: PopoverContent | null,
  ctx: SegmentContext,
): React.ReactElement {
  const content = hasMatch(inlineBody, ctx.searchQuery) ? highlight(inlineBody, ctx.searchQuery) : colorize(inlineBody)
  const segment = (
    <Text key={field.key} color={ctx.isCursor ? ctx.cursorFg : "$fg-muted"} dim={!ctx.isCursor}>
      {content}
    </Text>
  )
  return withHover(popContent, field.key, segment)
}

/** Build a plain (non-pill, non-body) header segment. */
function renderPlainSegment(
  field: FieldSpec,
  rendered: React.ReactNode,
  color: string | undefined,
  bold: boolean,
  popContent: PopoverContent | null,
  ctx: SegmentContext,
): React.ReactElement {
  const content =
    typeof rendered === "string" && hasMatch(rendered, ctx.searchQuery)
      ? highlight(rendered, ctx.searchQuery)
      : rendered
  const segment = (
    <Text key={field.key} color={ctx.isCursor ? ctx.cursorFg : color} bold={bold || ctx.isCursor || undefined}>
      {content}
    </Text>
  )
  return withHover(popContent, field.key, segment)
}

type HeaderBuildResult = {
  segments: React.ReactNode[]
  bodyLines: string[]
  bodyFieldKey: string | null
}

/** Walk `fields` and produce header segments + any deferred body (multiLine:"below" fields that don't fit inline). */
function buildHeader(row: LogRowData, fields: FieldSpec[], columns: number, ctx: SegmentContext): HeaderBuildResult {
  const segments: React.ReactNode[] = []
  let bodyLines: string[] = []
  let bodyFieldKey: string | null = null
  let headerCharWidth = 0

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    const raw = row.fields[field.key]
    const color = resolve(field.color, raw, row)
    const bold = resolve(field.bold, raw, row) ?? false
    const rendered = field.render ? field.render(raw, row) : valueToString(raw)
    const asStr = typeof rendered === "string" ? rendered : null

    // Body-like fields (multiLine:"below"): multi-line content always pushes below.
    // Single-line bodies inline only when they fit within terminal width.
    let inlineBody: string | null = null
    if (field.multiLine === "below" && asStr !== null && asStr.length > 0) {
      const allLines = asStr.split("\n")
      inlineBody = computeInlineFit({ allLines, headerCharWidth, columns })
      if (inlineBody === null) {
        bodyLines = allLines
        bodyFieldKey = field.key
        continue
      }
      if (inlineBody === "") continue
    }

    if (inlineBody === null && (rendered == null || rendered === "")) continue

    // Popover only when rendered actually hides content (raw ≠ rendered,
    // truncation, object projection). See original comment in git history.
    const renderedSurface = inlineBody !== null ? inlineBody : (asStr ?? "")
    const popContent =
      asStr !== null && hasHiddenContent(renderedSurface, raw)
        ? fieldPopoverContent(field.key, field.label, raw, asStr)
        : null

    if (PILL_FIELDS.has(field.key)) {
      segments.push(renderPillSegment(field, rendered, color, bold, popContent, ctx))
    } else if (inlineBody !== null) {
      segments.push(renderInlineBodySegment(field, inlineBody, popContent, ctx))
    } else {
      segments.push(renderPlainSegment(field, rendered, color, bold, popContent, ctx))
    }

    // Track the rendered width for the next field's inline-fit check.
    const segmentWidth =
      inlineBody !== null ? inlineBody.length : asStr !== null ? asStr.length : String(rendered ?? "").length
    headerCharWidth += segmentWidth
    if (i < fields.length - 1) {
      segments.push(<Text key={`sep-${field.key}`}> </Text>)
      headerCharWidth += 1
    }
  }

  return { segments, bodyLines, bodyFieldKey }
}

type BodyState = {
  hasBody: boolean
  isCollapsible: boolean
  trimmedBodyLines: string[]
  collapsedLines: string[]
  collapsedRemainder: number
}

/** Classify the body lines: flat / collapsible collapsed / collapsible expanded. */
function computeBodyState(bodyLines: string[]): BodyState {
  const hasBody = bodyLines.length > 0
  const trimmedBodyLines = hasBody ? bodyLines.slice() : []
  // Strip trailing blank lines only — preserve interior blanks so structure stays visible.
  while (trimmedBodyLines.length > 0 && trimmedBodyLines[trimmedBodyLines.length - 1]!.trim().length === 0) {
    trimmedBodyLines.pop()
  }
  // Collapse only when hiding > 1 line would be saved.
  const isCollapsible = trimmedBodyLines.length > BODY_COLLAPSED_MAX_LINES + 1
  const collapsedLines = isCollapsible ? trimmedBodyLines.slice(0, BODY_COLLAPSED_MAX_LINES) : trimmedBodyLines
  const collapsedRemainder = isCollapsible ? trimmedBodyLines.length - BODY_COLLAPSED_MAX_LINES : 0
  return { hasBody, isCollapsible, trimmedBodyLines, collapsedLines, collapsedRemainder }
}

/** Render a list of body lines (expanded or flat — same visual shape). */
function BodyLines({
  lines,
  keyPrefix,
  isCursor,
  bodyColor,
  searchQuery,
}: {
  lines: string[]
  keyPrefix: string
  isCursor: boolean
  bodyColor: string
  searchQuery: string
}) {
  return (
    <Box flexDirection="column" paddingLeft={BODY_INDENT}>
      {lines.map((line, i) => {
        const showHighlight = hasMatch(line, searchQuery)
        return (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable within a row
            key={`${keyPrefix}${i}`}
            color={bodyColor}
            dim={!isCursor}
            wrap="wrap"
          >
            {showHighlight ? highlight(line, searchQuery) : colorize(line)}
          </Text>
        )
      })}
    </Box>
  )
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
  const { columns } = useWindowSize()
  // Active search query — highlights matching substrings in every rendered
  // string (pill labels, inline body, body lines). Empty when no search.
  const searchCtx = useSearch()
  const searchQuery = searchCtx?.query ?? ""
  const cursorFg = "$fg-cursor"

  const ctx: SegmentContext = { isCursor, cursorFg, searchQuery }
  const { segments: headerSegments, bodyLines, bodyFieldKey } = buildHeader(row, fields, columns, ctx)
  const bodyColor = isCursor ? cursorFg : "$fg-muted"
  const { hasBody, isCollapsible, trimmedBodyLines, collapsedLines, collapsedRemainder } = computeBodyState(bodyLines)

  // No body-level popover — body is shown inline. bodyFieldKey is unused
  // now that there's no popover (was the popover title).
  void bodyFieldKey

  // Row-level click: toggle expansion only when there's something to hide.
  const onBoxClick = useCallback(
    (e: SilveryMouseEvent) => {
      if (!isCollapsible) return
      e.stopPropagation()
      onToggleExpand()
    },
    [isCollapsible, onToggleExpand],
  )

  // Show expanded body (with subtle bg) only when body is collapsible AND expanded.
  const showExpanded = isCollapsible && expanded
  const showCollapsed = isCollapsible && !expanded
  const showFlat = hasBody && !isCollapsible

  // Row bg cascade (most → least specific):
  //   cursor row   → $bg-cursor (strong selection indicator)
  //   expanded row → $bg-surface-subtle (whole-row tint signals "expanded")
  //   otherwise    → terminal default (no bg)
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
        <BodyLines
          lines={bodyLines}
          keyPrefix="b"
          isCursor={isCursor}
          bodyColor={bodyColor}
          searchQuery={searchQuery}
        />
      )}
      {showFlat && (
        <BodyLines
          lines={trimmedBodyLines}
          keyPrefix="f"
          isCursor={isCursor}
          bodyColor={bodyColor}
          searchQuery={searchQuery}
        />
      )}
    </Box>
  )
}
