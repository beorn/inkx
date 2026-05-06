import React, { createContext, useContext, useEffect, useMemo, useRef } from "react"
import { Box, Text, type Breakpoint, DEFAULT_BREAKPOINTS, useBoxRect } from "silvery"
import { createLogger } from "loggily"

type Responsive<T> = T | ({ default: T } & Partial<Record<Breakpoint, T>>)
type WidthValue = number | `${number}%`
type BodyWidth = "prose" | "wide" | "full" | "auto"

type BodyProps = {
  children: React.ReactNode
  width?: BodyWidth
  expanded?: boolean
  backgroundColor?: string
}

type ContentContextValue = {
  available: number
  measure: number
  wide: number
  full: number
  align: "start" | "center" | "stretch"
  gap: number
}

const DEFAULT_CONTEXT: ContentContextValue = {
  available: 0,
  measure: 88,
  wide: 120,
  full: 0,
  align: "start",
  gap: 1,
}

const layoutLog = createLogger("silvercode:layout")
const ContentContext = createContext<ContentContextValue | null>(null)
const ContentRowContext = createContext<{ available: number } | null>(null)

function resolveResponsive<T>(values: Responsive<T>, width: number): T {
  if (typeof values !== "object" || values === null || !("default" in values)) return values as T
  if (width >= DEFAULT_BREAKPOINTS.xl && values.xl !== undefined) return values.xl
  if (width >= DEFAULT_BREAKPOINTS.lg && values.lg !== undefined) return values.lg
  if (width >= DEFAULT_BREAKPOINTS.md && values.md !== undefined) return values.md
  if (width >= DEFAULT_BREAKPOINTS.sm && values.sm !== undefined) return values.sm
  if (width >= DEFAULT_BREAKPOINTS.xs && values.xs !== undefined) return values.xs
  return values.default
}

function resolveWidth(value: WidthValue, available: number): number {
  if (typeof value === "number") return Math.max(1, Math.min(value, available || value))
  const pct = Number(value.slice(0, -1))
  if (!Number.isFinite(pct)) return available
  return Math.max(1, Math.floor((available * pct) / 100))
}

export function useContentLayout(): ContentContextValue {
  return useContext(ContentContext) ?? DEFAULT_CONTEXT
}

export function useHasContentLayout(): boolean {
  return useContext(ContentContext) !== null
}

export function useResponsiveContent<T>(values: Responsive<T>): T {
  const ctx = useContentLayout()
  return resolveResponsive(values, ctx.available)
}

function laneJustify(align: ContentContextValue["align"]): "flex-start" | "center" | undefined {
  if (align === "center") return "center"
  return "flex-start"
}

function Layout({
  children,
  measure = 88,
  wide = 120,
  align = "center",
  gap = 1,
}: {
  children: React.ReactNode
  measure?: Responsive<WidthValue>
  wide?: Responsive<WidthValue>
  align?: Responsive<"start" | "center" | "stretch">
  gap?: number
}): React.ReactElement {
  return (
    <Box flexDirection="column" alignSelf="stretch" width="100%" minWidth={0} flexGrow={1} flexShrink={1} minHeight={0}>
      <MeasuredLayoutProbe measure={measure} wide={wide} align={align} gap={gap}>
        {children}
      </MeasuredLayoutProbe>
    </Box>
  )
}

function MeasuredLayoutProbe({
  children,
  measure,
  wide,
  align,
  gap,
}: {
  children: React.ReactNode
  measure: Responsive<WidthValue>
  wide: Responsive<WidthValue>
  align: Responsive<"start" | "center" | "stretch">
  gap: number
}): React.ReactElement {
  const rect = useBoxRect()
  const measured = Math.max(0, Math.round(rect.width))
  const available = measured
  const lastLogKey = useRef("")
  useEffect(() => {
    const key = `${measured}:${available}`
    if (key === lastLogKey.current) return
    lastLogKey.current = key
    layoutLog.debug?.("content layout probe", {
      measured,
      available,
      measuredReady: measured > 0,
    })
  }, [available, measured])
  return (
    <MeasuredLayout available={available} measure={measure} wide={wide} align={align} gap={gap}>
      {children}
    </MeasuredLayout>
  )
}

function MeasuredLayout({
  children,
  available,
  measure,
  wide,
  align,
  gap,
}: {
  children: React.ReactNode
  available: number
  measure: Responsive<WidthValue>
  wide: Responsive<WidthValue>
  align: Responsive<"start" | "center" | "stretch">
  gap: number
}): React.ReactElement {
  // Memoize the context value so its identity is stable when none of its
  // inputs change. Without memoization, every parent re-render produces a
  // new object identity and every consumer of `useContentLayout()` re-renders
  // even when the resolved widths haven't changed — which compounds the
  // post-resize feedback loop documented in
  // `@km/silvercode/post-resize-ui-stability`. Memo deps cover every input
  // that participates in the value's derivation.
  const value: ContentContextValue = useMemo(
    () => ({
      available,
      measure: resolveWidth(resolveResponsive(measure, available), available),
      wide: resolveWidth(resolveResponsive(wide, available), available),
      full: available,
      align: resolveResponsive(align, available),
      gap,
    }),
    [available, measure, wide, align, gap],
  )
  const lastLogKey = useRef("")
  useEffect(() => {
    const key = `${value.available}:${value.measure}:${value.wide}:${value.full}:${value.align}:${value.gap}`
    if (key === lastLogKey.current) return
    lastLogKey.current = key
    layoutLog.debug?.("content layout resolved", value)
  }, [value.available, value.measure, value.wide, value.full, value.align, value.gap])
  return (
    <ContentContext.Provider value={value}>
      <Box
        flexDirection="column"
        alignSelf="stretch"
        width="100%"
        minWidth={0}
        flexGrow={1}
        flexShrink={1}
        minHeight={0}
      >
        {children}
      </Box>
    </ContentContext.Provider>
  )
}

function isElementOfType<P>(child: React.ReactNode, type: React.ComponentType<P>): child is React.ReactElement<P> {
  return React.isValidElement(child) && child.type === type
}

function Left({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function Right({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function resolveBodyWidth(width: BodyWidth | undefined, expanded: boolean | undefined): Exclude<BodyWidth, "auto"> {
  void expanded
  return width === "auto" || width === undefined ? "prose" : width
}

function Row({
  children,
  gap,
  align,
}: {
  children: React.ReactNode
  gap?: number
  align?: ContentContextValue["align"]
}): React.ReactElement {
  const ctx = useContentLayout()
  void gap
  const rowAlign = align ?? ctx.align
  const left: React.ReactNode[] = []
  const right: React.ReactNode[] = []
  const middle: React.ReactNode[] = []
  for (const child of React.Children.toArray(children)) {
    if (isElementOfType(child, Left)) left.push(child.props.children)
    else if (isElementOfType(child, Right)) right.push(child.props.children)
    else middle.push(child)
  }
  const hasDirectProseLane = middle.some((child) => isElementOfType(child, ProseLane))
  const hasDirectFullLane = middle.some((child) => isElementOfType(child, Full))
  const hasDirectWideLane = middle.some((child) => isElementOfType(child, Wide))
  const hasDirectFullBody = middle.some(
    (child) => isElementOfType(child, Body) && resolveBodyWidth(child.props.width, child.props.expanded) === "full",
  )
  const hasDirectWideBody = middle.some(
    (child) => isElementOfType(child, Body) && resolveBodyWidth(child.props.width, child.props.expanded) === "wide",
  )
  const hasDirectProseBody = middle.some(
    (child) => isElementOfType(child, Body) && resolveBodyWidth(child.props.width, child.props.expanded) === "prose",
  )
  const laneWidth = hasDirectFullLane
    ? ctx.full || ctx.available || ctx.wide
    : hasDirectFullBody
      ? ctx.full || ctx.available || ctx.wide
      : hasDirectProseLane
        ? ctx.measure
        : hasDirectProseBody
          ? ctx.measure
          : hasDirectWideLane
            ? ctx.wide
            : hasDirectWideBody
              ? ctx.wide
              : ctx.wide
  const leftWidth = 0
  const rightWidth = 0
  const leftGap = 0
  const rightGap = 0
  const available = ctx.available > 0 ? ctx.available : laneWidth
  const sideWidth = leftWidth + leftGap + rightGap + rightWidth
  const middleAvailable = ctx.available > 0 ? Math.max(1, available - sideWidth) : laneWidth
  const width = ctx.available > 0 ? Math.min(laneWidth, middleAvailable) : laneWidth
  const middleSelfAligns =
    hasDirectProseLane ||
    hasDirectWideLane ||
    hasDirectFullLane ||
    hasDirectProseBody ||
    hasDirectWideBody ||
    hasDirectFullBody
  const middleWidth = middleSelfAligns ? middleAvailable : width
  const occupiedWidth = width + sideWidth
  const leftMargin = rowAlign === "center" ? Math.max(0, Math.floor((available - occupiedWidth) / 2)) : 0
  const rightMargin = rowAlign === "center" ? Math.max(0, available - occupiedWidth - leftMargin) : 0
  const leftSpacer = rowAlign === "center" && !middleSelfAligns ? leftMargin : 0
  const rightSpacer = rowAlign === "center" && !middleSelfAligns ? rightMargin : 0
  const usesMeasuredGeometry = ctx.available > 0
  const lastLogKey = useRef("")
  useEffect(() => {
    const key = [
      ctx.available,
      ctx.measure,
      ctx.wide,
      rowAlign,
      laneWidth,
      middleAvailable,
      width,
      middleWidth,
      leftMargin,
      rightMargin,
      left.length,
      right.length,
      middle.length,
      hasDirectProseLane,
      hasDirectWideLane,
      hasDirectFullLane,
      hasDirectProseBody,
      hasDirectWideBody,
      hasDirectFullBody,
      usesMeasuredGeometry,
    ].join(":")
    if (key === lastLogKey.current) return
    lastLogKey.current = key
    layoutLog.debug?.("content row resolved", {
      available,
      rowAlign,
      laneWidth,
      middleAvailable,
      width,
      middleWidth,
      occupiedWidth,
      leftMargin,
      rightMargin,
      leftSpacer,
      rightSpacer,
      leftCount: left.length,
      rightCount: right.length,
      middleCount: middle.length,
      middleSelfAligns,
      hasDirectProseLane,
      hasDirectWideLane,
      hasDirectFullLane,
      hasDirectProseBody,
      hasDirectWideBody,
      hasDirectFullBody,
      usesMeasuredGeometry,
    })
  }, [
    available,
    ctx.available,
    ctx.measure,
    ctx.wide,
    hasDirectFullBody,
    hasDirectFullLane,
    hasDirectProseBody,
    hasDirectProseLane,
    hasDirectWideBody,
    hasDirectWideLane,
    laneWidth,
    left.length,
    leftMargin,
    leftSpacer,
    middle.length,
    middleAvailable,
    middleSelfAligns,
    middleWidth,
    occupiedWidth,
    right.length,
    rightMargin,
    rightSpacer,
    rowAlign,
    usesMeasuredGeometry,
    width,
  ])
  // Stable React tree across all measurement states. The previous code
  // had a structural branch on `usesMeasuredGeometry` (= `ctx.available > 0`)
  // — when `available` flipped between 0 and a measured value during the
  // post-resize cascade, this Row torn down its subtree and rebuilt it,
  // which reset every descendant useBoxRect measurement and cascaded
  // through ContentContext consumers. Bead:
  // `@km/silvercode/post-resize-ui-stability`.
  //
  // Same tree always. Width-derived ternaries above (`available`,
  // `middleAvailable`, `width`) feed in the resolved values so the layout
  // is correct in both pre-measurement (=0 → laneWidth fallback) and
  // measured (>0 → real available) states. ContentRowContext value of 0
  // when not measured is provided as before for downstream lanes that
  // care.
  const leftAside =
    usesMeasuredGeometry && left.length > 0 && leftMargin > 0 ? (
      <Box position="absolute" top={0} left={0} width={leftMargin} flexDirection="row" justifyContent="flex-end">
        {left}
      </Box>
    ) : null
  const rightAside =
    usesMeasuredGeometry && right.length > 0 && rightMargin > 0 ? (
      <Box position="absolute" top={0} right={0} width={rightMargin} flexDirection="row" justifyContent="flex-start">
        {right}
      </Box>
    ) : null
  const middleAvailableForRow = usesMeasuredGeometry ? middleWidth : 0
  // Stop propagating measured pixel widths upward through `width=`. Silvery
  // expert audit (2026-05-06, bead `@km/silvercode/post-resize-ui-stability`)
  // identified `width={middleWidth}` as the load-bearing feedback edge: an
  // explicit `width` on a flex child changes its main-axis basis, which
  // changes the row's intrinsic size, which the parent's flexbox re-uses on
  // the next convergence pass — visible as the 88↔120 oscillation in the
  // STRICT log. Switching to `maxWidth` (a hint, not authoritative width)
  // lets flexily own the final resolved width and breaks the prop-value
  // feedback edge that survived the Phase 3 stable-tree fix.
  const middleNode = (
    <ContentRowContext.Provider value={{ available: middleAvailableForRow }}>
      <Box
        flexDirection="row"
        flexGrow={1}
        maxWidth={usesMeasuredGeometry ? middleWidth : "100%"}
        flexShrink={1}
        minWidth={0}
      >
        {middle}
      </Box>
    </ContentRowContext.Provider>
  )
  const showSpacers = usesMeasuredGeometry && rowAlign === "center"
  return (
    <Box flexDirection="row" alignSelf="stretch" width="100%" minWidth={0} flexShrink={0} position="relative">
      {leftAside}
      {rightAside}
      {showSpacers && leftSpacer > 0 ? <Box width={leftSpacer} flexShrink={1} minWidth={0} /> : null}
      {middleNode}
      {showSpacers && rightSpacer > 0 ? <Box width={rightSpacer} flexShrink={1} minWidth={0} /> : null}
    </Box>
  )
}

function ProseLane({ children }: { children: React.ReactNode }): React.ReactElement {
  const row = useContext(ContentRowContext)
  const ctx = useContentLayout()
  const available = row?.available ?? ctx.available
  const gutterMinWidth = available > 2 ? 1 : 0
  const proseWidth = available > 0 ? Math.max(1, Math.min(ctx.measure, available - gutterMinWidth * 2)) : ctx.measure
  const lane = (
    <Box flexDirection="row" width="100%" minWidth={0}>
      <Box width={gutterMinWidth} flexGrow={1} flexBasis={gutterMinWidth} flexShrink={0} minWidth={gutterMinWidth} />
      <Box flexDirection="column" width={proseWidth} maxWidth={proseWidth} flexShrink={1} minWidth={0}>
        {children}
      </Box>
      <Box width={gutterMinWidth} flexGrow={1} flexBasis={gutterMinWidth} flexShrink={0} minWidth={gutterMinWidth} />
    </Box>
  )
  if (row) {
    return (
      <Box flexDirection="row" width="100%" justifyContent={laneJustify(ctx.align)} minWidth={0}>
        {lane}
      </Box>
    )
  }
  return (
    <Box flexDirection="row" width="100%" justifyContent={laneJustify(ctx.align)} minWidth={0}>
      {lane}
    </Box>
  )
}

function Wide({ children }: { children: React.ReactNode }): React.ReactElement {
  const row = useContext(ContentRowContext)
  const ctx = useContentLayout()
  const available = row?.available ?? ctx.available
  if (available <= 0) {
    return (
      <Box flexDirection="row" width="100%" justifyContent={laneJustify(ctx.align)} minWidth={0}>
        <Box flexDirection="column" width="100%" minWidth={0}>
          {children}
        </Box>
      </Box>
    )
  }
  const width = available > 0 ? Math.min(ctx.wide, available) : ctx.wide
  return (
    <Box flexDirection="row" width="100%" justifyContent={laneJustify(ctx.align)} minWidth={0}>
      <ContentRowContext.Provider value={{ available: width }}>
        <Box flexDirection="column" width={width} maxWidth={width} minWidth={0}>
          {children}
        </Box>
      </ContentRowContext.Provider>
    </Box>
  )
}

function Full({ children }: { children: React.ReactNode }): React.ReactElement {
  const row = useContext(ContentRowContext)
  const ctx = useContentLayout()
  const available = row?.available ?? ctx.available
  const gutterWidth = available > 2 ? 1 : 0
  return (
    <Box flexDirection="row" width="100%" minWidth={0}>
      {gutterWidth > 0 ? (
        <Box width={gutterWidth} flexShrink={0}>
          <Text> </Text>
        </Box>
      ) : null}
      <Box flexDirection="column" flexGrow={1} flexBasis={0} flexShrink={1} minWidth={0} overflow="hidden">
        {children}
      </Box>
      {gutterWidth > 0 ? (
        <Box width={gutterWidth} flexShrink={0}>
          <Text> </Text>
        </Box>
      ) : null}
    </Box>
  )
}

function Body({ children, width = "auto", expanded = false, backgroundColor }: BodyProps): React.ReactElement {
  const resolved = resolveBodyWidth(width, expanded)
  const body =
    backgroundColor === undefined ? (
      children
    ) : (
      <Box flexDirection="column" width="100%" minWidth={0} backgroundColor={backgroundColor}>
        {children}
      </Box>
    )
  if (resolved === "full") return <Full>{body}</Full>
  if (resolved === "wide") return <Wide>{body}</Wide>
  return <ProseLane>{body}</ProseLane>
}

function Auto({
  naturalWidth,
  children,
  overflow,
}: {
  naturalWidth: number
  children: React.ReactNode
  overflow?: React.ReactNode
}): React.ReactElement {
  const ctx = useContentLayout()
  if (ctx.available > 0 && naturalWidth > ctx.available) {
    return overflow ? <>{overflow}</> : <Full>{children}</Full>
  }
  if (naturalWidth <= ctx.measure) return <ProseLane>{children}</ProseLane>
  if (naturalWidth <= ctx.wide) return <Wide>{children}</Wide>
  return <Full>{children}</Full>
}

type TableAlignment = "left" | "right" | "center" | null

function tableNaturalWidths(headers: readonly string[], rows: readonly (readonly string[])[]): number[] {
  return headers.map((header, col) => {
    const maxRow = rows.reduce((w, row) => Math.max(w, (row[col] ?? "").length), 0)
    return Math.max(header.length, maxRow)
  })
}

function tableFrameWidth(widths: readonly number[], separatorWidth: number): number {
  return widths.reduce((sum, width) => sum + width, 0) + separatorWidth * Math.max(0, widths.length - 1) + 2
}

function shrinkTableWidths(widths: readonly number[], targetWidth: number, separatorWidth: number): number[] | null {
  if (widths.length === 0) return []
  const separatorTotal = separatorWidth * Math.max(0, widths.length - 1)
  const availableCells = targetWidth - separatorTotal - 2
  const minimums = widths.map((width) => Math.min(width, 8))
  const minimumTotal = minimums.reduce((sum, width) => sum + width, 0)
  if (availableCells < minimumTotal) return null

  const out = [...widths]
  let total = out.reduce((sum, width) => sum + width, 0)
  let overflow = total - availableCells
  while (overflow > 0) {
    const candidates = out
      .map((width, index) => ({ width, index, reducible: width - minimums[index]! }))
      .filter((candidate) => candidate.reducible > 0)
      .sort((a, b) => b.width - a.width)
    const candidate = candidates[0]
    if (!candidate) return null
    out[candidate.index] = (out[candidate.index] ?? 0) - 1
    overflow -= 1
    total -= 1
  }
  return out
}

function wrapCell(text: string, width: number): string[] {
  if (width <= 0) return [""]
  const out: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.trim().length > 0 ? rawLine.trim().split(/\s+/) : [""]
    let line = ""
    for (const originalWord of words) {
      let word = originalWord
      if (line.length > 0 && line.length + 1 + word.length <= width) {
        line += ` ${word}`
        continue
      }
      if (line.length > 0) {
        out.push(line)
        line = ""
      }
      while (word.length > width) {
        out.push(word.slice(0, width))
        word = word.slice(width)
      }
      line = word
    }
    out.push(line)
  }
  return out.length > 0 ? out : [""]
}

function padCellLine(text: string, width: number, align: TableAlignment | undefined): string {
  const clipped = text.length > width ? text.slice(0, width) : text
  if (align === "right") return clipped.padStart(width)
  if (align === "center") {
    const extra = width - clipped.length
    const left = Math.floor(extra / 2)
    return " ".repeat(left) + clipped + " ".repeat(extra - left)
  }
  return clipped.padEnd(width)
}

type TableProps = {
  headers: string[]
  rows: string[][]
  alignments?: TableAlignment[]
}

type TableGridProps = TableProps & {
  widths?: number[]
  separator?: string
}

function TableRoot({ headers, rows, alignments = [] }: TableProps): React.ReactElement {
  const ctx = useContentLayout()
  const row = useContext(ContentRowContext)
  const separator = " │ "
  const naturalWidths = tableNaturalWidths(headers, rows)
  const fullWidth = row?.available ?? ctx.full ?? ctx.available ?? ctx.wide
  const fullLaneWidth = fullWidth > 2 ? fullWidth - 2 : fullWidth
  const lanes: Array<{ width: number; wrap: (children: React.ReactNode) => React.ReactElement }> = [
    { width: ctx.measure, wrap: (children) => <ProseLane>{children}</ProseLane> },
    { width: ctx.wide, wrap: (children) => <Wide>{children}</Wide> },
    { width: fullLaneWidth, wrap: (children) => <Full>{children}</Full> },
  ]

  for (const lane of lanes) {
    if (tableFrameWidth(naturalWidths, separator.length) > lane.width) continue
    return lane.wrap(
      <TableGridRoot
        headers={headers}
        rows={rows}
        alignments={alignments}
        widths={naturalWidths}
        separator={separator}
      />,
    )
  }

  if (fullLaneWidth >= 64) {
    const widths = shrinkTableWidths(naturalWidths, fullLaneWidth, separator.length)
    if (widths) {
      return (
        <Full>
          <TableGridRoot headers={headers} rows={rows} alignments={alignments} widths={widths} separator={separator} />
        </Full>
      )
    }
  }

  return <TableBlocksRoot headers={headers} rows={rows} alignments={alignments} />
}

function TableGridRoot({
  headers,
  rows,
  alignments = [],
  widths,
  separator = " │ ",
}: TableGridProps): React.ReactElement {
  const gridWidths = widths ?? tableNaturalWidths(headers, rows)
  const frameWidth = tableFrameWidth(gridWidths, separator.length)
  const headerRule = gridWidths.map((width) => "─".repeat(width)).join("─┼─")
  const topRule = gridWidths.map((width) => "─".repeat(width)).join("─┬─")
  const bottomRule = gridWidths.map((width) => "─".repeat(width)).join("─┴─")
  const showRowDividers = rows.length > 0 && rows.length < 5
  const renderCells = (cells: readonly string[], bold = false): React.ReactElement[] => {
    const wrapped = headers.map((_, col) => wrapCell(cells[col] ?? "", gridWidths[col] ?? 0))
    const height = Math.max(1, ...wrapped.map((lines) => lines.length))
    return Array.from({ length: height }, (_, lineIndex) => (
      <Text key={lineIndex} wrap={false}>
        <Text color="$border">│</Text>
        {headers.map((_, col) => (
          <React.Fragment key={col}>
            {col > 0 && <Text color="$border">{separator}</Text>}
            <Text bold={bold} color={bold ? "$primary" : undefined}>
              {padCellLine(wrapped[col]?.[lineIndex] ?? "", gridWidths[col] ?? 0, alignments[col])}
            </Text>
          </React.Fragment>
        ))}
        <Text color="$border">│</Text>
      </Text>
    ))
  }
  return (
    <Box flexDirection="column" alignSelf="flex-start" width={frameWidth} maxWidth={frameWidth}>
      <Text color="$border" wrap={false}>
        ┌{topRule}┐
      </Text>
      {renderCells(headers, true)}
      <Text color="$border" wrap={false}>
        ├{headerRule}┤
      </Text>
      {rows.map((row, rowIdx) => (
        <React.Fragment key={rowIdx}>
          {showRowDividers && rowIdx > 0 ? (
            <Text color="$border" wrap={false}>
              ├{headerRule}┤
            </Text>
          ) : null}
          {renderCells(row)}
        </React.Fragment>
      ))}
      <Text color="$border" wrap={false}>
        └{bottomRule}┘
      </Text>
    </Box>
  )
}

function TableBlocksRoot({ headers, rows }: TableProps): React.ReactElement {
  return (
    <Full>
      <Box flexDirection="column" gap={1} borderStyle="single" borderColor="$border" paddingX={1}>
        {rows.map((row, rowIdx) => (
          <Box key={rowIdx} flexDirection="column">
            {headers.map((header, col) => (
              <Text key={col} wrap="wrap">
                <Text bold color="$primary">
                  {header}:
                </Text>{" "}
                {row[col] ?? ""}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    </Full>
  )
}

const Table = Object.assign(TableRoot, {
  Grid: TableGridRoot,
  Blocks: TableBlocksRoot,
})

function Aside({
  children,
  side = "left",
  show = true,
  paddingTop = 0,
}: {
  children: React.ReactNode
  side?: "left" | "right"
  show?: boolean
  paddingTop?: number
}): React.ReactElement | null {
  if (!show) return null
  const node = (
    <Text color="$fg-muted" flexShrink={0}>
      {children}
    </Text>
  )
  return (
    <Box
      flexShrink={0}
      paddingLeft={side === "right" ? 1 : 0}
      paddingRight={side === "left" ? 1 : 0}
      paddingTop={paddingTop}
    >
      {node}
    </Box>
  )
}

export const Content = {
  Layout,
  Row,
  Left,
  Body,
  Prose: ProseLane,
  Wide,
  Full,
  Auto,
  Table,
  Right,
  Aside,
}
