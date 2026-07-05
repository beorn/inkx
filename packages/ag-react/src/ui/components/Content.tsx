import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { createLogger } from "loggily"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useOnBoxRectCommitted } from "../../hooks/useLayout"
import { type Breakpoint, DEFAULT_BREAKPOINTS } from "../../hooks/useResponsiveValue"
import { useTerm } from "../../hooks/useTerm"
import { densityForWidth } from "../density"

export type Responsive<T> = T | ({ default: T } & Partial<Record<Breakpoint, T>>)
export type WidthValue = number | `${number}%`
export type ContentBodyWidth = "prose" | "wide" | "full" | "auto"

export type ContentBodyProps = {
  children: React.ReactNode
  width?: ContentBodyWidth
  backgroundColor?: string
  /**
   * Inner-edge left padding inside the resolved lane. Used when a visual group
   * indents rows but the indent must still count against the lane budget.
   */
  paddingLeft?: number
  /**
   * Inner-edge right padding inside the resolved lane. Used when a visual
   * group needs to reserve trailing space while keeping that reserve inside
   * the lane budget.
   */
  paddingRight?: number
}

export type ContentLayoutContextValue = {
  available: number
  prose: number
  wide: number
  full: number
  align: "start" | "center" | "stretch"
  gap: number
}

const DEFAULT_CONTEXT: ContentLayoutContextValue = {
  available: 0,
  prose: 96,
  wide: 120,
  full: 0,
  align: "start",
  gap: 1,
}

const layoutLog = createLogger("silvery:content-layout")
const ContentContext = createContext<ContentLayoutContextValue | null>(null)
const ContentRowContext = createContext<{ available: number } | null>(null)

function contentSideSpacingForWidth(width: number): {
  readonly sideGapCells: 0 | 1
  readonly sideSlotMaxWidthCells: 0 | 8
} {
  if (densityForWidth(width) === "compact") {
    return { sideGapCells: 0, sideSlotMaxWidthCells: 0 }
  }
  return { sideGapCells: 1, sideSlotMaxWidthCells: 8 }
}

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

export function useContentLayout(): ContentLayoutContextValue {
  return useContext(ContentContext) ?? DEFAULT_CONTEXT
}

export function useHasContentLayout(): boolean {
  return useContext(ContentContext) !== null
}

/**
 * The width (in cells) of the *rendered* row middle a descendant is laid
 * out inside — the value `Content.Row` puts on `ContentRowContext`.
 *
 * This is the lane-true width: it reflects the measured row geometry, so
 * it shrinks when the surrounding pane is narrow (e.g. the storybook
 * preview pane, a nested split, or a side-panel-open app) — unlike
 * `useContentLayout().prose`, which is resolved off the *full* terminal
 * cols when no `<PaneSize>` provider is present and therefore over-reads
 * inside a narrow pane.
 *
 * Returns `0` before the row's geometry is measured. Callers that need a
 * non-zero width on the first paint should fall back to
 * `useContentLayout().prose` when this returns `0`.
 */
export function useContentRowWidth(): number {
  return useContext(ContentRowContext)?.available ?? 0
}

export function useResponsiveContent<T>(values: Responsive<T>): T {
  const ctx = useContentLayout()
  return resolveResponsive(values, ctx.available)
}

function laneJustify(
  align: ContentLayoutContextValue["align"],
): "flex-start" | "center" | undefined {
  if (align === "center") return "center"
  return "flex-start"
}

/**
 * Pane-size context — App.tsx (or any app shell) provides `paneCols` from
 * declarative inputs (terminal cols + panel state). Content.Layout reads
 * this instead of measuring its own rect.
 *
 * Fallback when no provider: Layout reads `useTerm((t) => t.size.cols())`
 * directly, treating the full terminal width as the pane. This keeps standalone
 * Content.Layout consumers (tests, examples) working without ceremony.
 */
const PaneSizeContext = createContext<{ paneCols: number } | null>(null)

export function PaneSize({
  paneCols,
  children,
}: {
  paneCols: number
  children: React.ReactNode
}): React.ReactElement {
  const value = useMemo(() => ({ paneCols }), [paneCols])
  return <PaneSizeContext.Provider value={value}>{children}</PaneSizeContext.Provider>
}

/**
 * MeasuredPaneScope — re-provide `PaneSize` at the ACTUALLY-painted width of
 * this subtree, clamped to never exceed the inherited declared paneCols.
 *
 * The app-level `PaneSize` declares the pre-split pane width (terminal cols
 * minus surrounding chrome). But content can paint inside a narrower box when
 * the pane is sub-divided below that declaration, or during transient resize
 * frames before layout has settled. `Content.Layout` resolves `ctx.available` /
 * `prose` from the declared paneCols, so its prose lane can otherwise wrap at
 * the declared width while `overflow:hidden` clips at the narrower painted
 * width.
 *
 * The clamp is `min(declared, measured)`, seeded at `declared`: the first paint
 * uses the declared width (a correct full-width lane, NOT a flush-left 0→N
 * snap), then narrows to the measured width once layout commits. Going
 * wide→narrow only reflows the lane tighter — it never reintroduces the
 * first-paint flush-left flash that motivated the declarative B.3 paneCols. The
 * measured width is read via `useOnBoxRectCommitted` (commit-boundary callback,
 * no mid-batch feedback edge) into local state, the standard two-paint measured
 * wrapper.
 */
export function MeasuredPaneScope({ children }: { children: React.ReactNode }): React.ReactElement {
  const paneCtx = useContext(PaneSizeContext)
  const termCols = useTerm((t) => t.size.cols())
  const declared = paneCtx?.paneCols ?? termCols
  const [measured, setMeasured] = useState(0)
  useOnBoxRectCommitted((rect) => {
    if (rect.width > 0) setMeasured(rect.width)
  })
  const paneCols = measured > 0 ? Math.min(declared, measured) : declared
  return (
    // flex-ceremony-ok: must shrink with the pane so the measured width is the
    // real paint, not the declared paneCols (that measurement is the point).
    <Box flexDirection="column" width="100%" minWidth={0} flexGrow={1} flexShrink={1} minHeight={0}>
      <PaneSize paneCols={paneCols}>{children}</PaneSize>
    </Box>
  )
}

function Layout({
  children,
  fill = true,
  prose = 96,
  wide = 120,
  align = "center",
  gap = 1,
}: {
  children: React.ReactNode
  fill?: boolean
  prose?: Responsive<WidthValue>
  wide?: Responsive<WidthValue>
  align?: Responsive<"start" | "center" | "stretch">
  gap?: number
}): React.ReactElement {
  // Declarative paneCols — from PaneSize context if app provides it, else
  // fallback to the full terminal cols. NO useBoxRect read; ctx is correct
  // from frame 0, eliminating the 0→N transition that produces
  // flush-left-on-first-paint regressions.
  const paneCtx = useContext(PaneSizeContext)
  const termCols = useTerm((t) => t.size.cols())
  const paneCols = paneCtx?.paneCols ?? termCols

  // Memoize the context value so its identity is stable when none of its
  // inputs change. Without memoization, every parent re-render produces a
  // new object identity and every consumer of `useContentLayout()` re-renders
  // even when the resolved widths haven't changed.
  const value: ContentLayoutContextValue = useMemo(
    () => ({
      available: paneCols,
      prose: resolveWidth(resolveResponsive(prose, paneCols), paneCols),
      wide: resolveWidth(resolveResponsive(wide, paneCols), paneCols),
      full: paneCols,
      align: resolveResponsive(align, paneCols),
      gap,
    }),
    [paneCols, prose, wide, align, gap],
  )

  const lastLogKey = useRef("")
  useEffect(() => {
    const key = `${value.available}:${value.prose}:${value.wide}:${value.full}:${value.align}:${value.gap}`
    if (key === lastLogKey.current) return
    lastLogKey.current = key
    layoutLog.debug?.("content layout resolved (declarative)", value)
  }, [value])

  return (
    <Box
      flexDirection="column"
      alignSelf="stretch"
      width="100%"
      minWidth={0}
      flexGrow={fill ? 1 : 0}
      flexShrink={fill ? 1 : 0}
      minHeight={fill ? 0 : undefined}
    >
      <ContentContext.Provider value={value}>
        <Box
          flexDirection="column"
          alignSelf="stretch"
          width="100%"
          minWidth={0}
          flexGrow={fill ? 1 : 0}
          flexShrink={fill ? 1 : 0}
          minHeight={fill ? 0 : undefined}
        >
          {children}
        </Box>
      </ContentContext.Provider>
    </Box>
  )
}

function isElementOfType<P>(
  child: React.ReactNode,
  type: React.ComponentType<P>,
): child is React.ReactElement<P> {
  return React.isValidElement(child) && child.type === type
}

function Left({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function Right({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function resolveBodyWidth(width: ContentBodyWidth | undefined): Exclude<ContentBodyWidth, "auto"> {
  // `auto` resolves to `full` for Row sizing so the lane chooser can pick
  // any lane (prose / wide / full) from the full available width. Without
  // this, Row sized to prose (96) and the "wide" (120) lane was capped at
  // prose → no actual promotion. AutoLane itself still picks the smallest
  // fitting lane via `<Box fitWidth>`; the Row just gives it room to do so.
  if (width === "auto") return "full"
  return width === undefined ? "prose" : width
}

/**
 * Pure helper: derive the lane set for `<Content.Body width="auto">` from a
 * Content layout context. Lanes are sorted ascending and de-duplicated so
 * flexily's `fitWidth` "smallest fitting lane" pick is unambiguous.
 * No-fallbacks: if no lane width resolves to a positive number we throw
 * at construction. Silent best-effort would hide a misconfigured
 * `Content.Layout` (or an auto-lane consumer placed outside a
 * `Content.Layout`).
 */
function autoLaneWidths(prose: number, wide: number, full: number): number[] {
  const lanes = [prose, wide, full].filter(
    (w): w is number => typeof w === "number" && Number.isFinite(w) && w > 0,
  )
  const unique = Array.from(new Set(lanes)).sort((a, b) => a - b)
  if (unique.length === 0) {
    throw new Error(
      'Content.Body width="auto": no positive lane widths resolved from ' +
        `ContentContext (prose=${prose}, wide=${wide}, full=${full}). ` +
        "Ensure the body is rendered inside a <Content.Layout> with valid prose/wide widths.",
    )
  }
  return unique
}

type RowSlots = {
  left: React.ReactNode[]
  right: React.ReactNode[]
  middle: React.ReactNode[]
}

type RowLaneFlags = {
  hasDirectProseLane: boolean
  hasDirectFullLane: boolean
  hasDirectWideLane: boolean
  hasDirectFullBody: boolean
  hasDirectWideBody: boolean
  hasDirectProseBody: boolean
}

function splitRowSlots(children: React.ReactNode): RowSlots {
  const slots: RowSlots = { left: [], right: [], middle: [] }
  for (const child of React.Children.toArray(children)) {
    if (isElementOfType(child, Left)) slots.left.push(child.props.children)
    else if (isElementOfType(child, Right)) slots.right.push(child.props.children)
    else slots.middle.push(child)
  }
  return slots
}

function rowLaneFlags(middle: readonly React.ReactNode[]): RowLaneFlags {
  return {
    hasDirectProseLane: middle.some((child) => isElementOfType(child, ProseLane)),
    hasDirectFullLane: middle.some((child) => isElementOfType(child, Full)),
    hasDirectWideLane: middle.some((child) => isElementOfType(child, Wide)),
    hasDirectFullBody: middle.some(
      (child) => isElementOfType(child, Body) && resolveBodyWidth(child.props.width) === "full",
    ),
    hasDirectWideBody: middle.some(
      (child) => isElementOfType(child, Body) && resolveBodyWidth(child.props.width) === "wide",
    ),
    hasDirectProseBody: middle.some(
      (child) => isElementOfType(child, Body) && resolveBodyWidth(child.props.width) === "prose",
    ),
  }
}

function resolveRowLaneWidth(ctx: ContentLayoutContextValue, flags: RowLaneFlags): number {
  if (flags.hasDirectFullLane || flags.hasDirectFullBody)
    return ctx.full || ctx.available || ctx.wide
  if (flags.hasDirectProseLane || flags.hasDirectProseBody) return ctx.prose
  return ctx.wide
}

function rowMiddleSelfAligns(flags: RowLaneFlags): boolean {
  return (
    flags.hasDirectProseLane ||
    flags.hasDirectWideLane ||
    flags.hasDirectFullLane ||
    flags.hasDirectProseBody ||
    flags.hasDirectWideBody ||
    flags.hasDirectFullBody
  )
}

function Row({
  children,
  align,
}: {
  children: React.ReactNode
  align?: ContentLayoutContextValue["align"]
}): React.ReactElement {
  const ctx = useContentLayout()
  const rowAlign = align ?? ctx.align
  const { left, right, middle } = splitRowSlots(children)
  const laneFlags = rowLaneFlags(middle)
  const {
    hasDirectProseLane,
    hasDirectFullLane,
    hasDirectWideLane,
    hasDirectFullBody,
    hasDirectWideBody,
    hasDirectProseBody,
  } = laneFlags
  const laneWidth = resolveRowLaneWidth(ctx, laneFlags)
  const available = ctx.available > 0 ? ctx.available : laneWidth
  const paneChrome = contentSideSpacingForWidth(available)
  const hasSideSlots = left.length > 0 || right.length > 0
  const sideGap = hasSideSlots && available >= 32 ? paneChrome.sideGapCells : 0
  const sideSlotWidth = hasSideSlots
    ? Math.max(
        0,
        Math.min(paneChrome.sideSlotMaxWidthCells, Math.floor((available - 24) / 2) - sideGap),
      )
    : 0
  const sideReserve = hasSideSlots && sideSlotWidth > 0 ? (sideSlotWidth + sideGap) * 2 : 0
  const middleAvailable = ctx.available > 0 ? Math.max(1, available - sideReserve) : laneWidth
  const width = ctx.available > 0 ? Math.min(laneWidth, middleAvailable) : laneWidth
  const middleSelfAligns = rowMiddleSelfAligns(laneFlags)
  const middleWidth = hasSideSlots ? width : middleSelfAligns ? middleAvailable : width
  const occupiedWidth = width + sideReserve
  const leftMargin =
    rowAlign === "center" ? Math.max(0, Math.floor((available - occupiedWidth) / 2)) : 0
  const rightMargin =
    rowAlign === "center" ? Math.max(0, available - occupiedWidth - leftMargin) : 0
  const leftSpacer = rowAlign === "center" && (hasSideSlots || !middleSelfAligns) ? leftMargin : 0
  const rightSpacer = rowAlign === "center" && (hasSideSlots || !middleSelfAligns) ? rightMargin : 0
  const usesMeasuredGeometry = ctx.available > 0
  const lastLogKey = useRef("")
  useEffect(() => {
    const key = [
      ctx.available,
      ctx.prose,
      ctx.wide,
      rowAlign,
      laneWidth,
      middleAvailable,
      width,
      middleWidth,
      leftMargin,
      rightMargin,
      sideGap,
      sideReserve,
      sideSlotWidth,
      left.length,
      right.length,
      middle.length,
      hasSideSlots,
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
      sideGap,
      sideReserve,
      sideSlotWidth,
      leftCount: left.length,
      rightCount: right.length,
      middleCount: middle.length,
      hasSideSlots,
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
    ctx.prose,
    ctx.wide,
    hasDirectFullBody,
    hasDirectFullLane,
    hasDirectProseBody,
    hasDirectProseLane,
    hasSideSlots,
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
    sideGap,
    sideReserve,
    sideSlotWidth,
    usesMeasuredGeometry,
    width,
  ])
  // Stable React tree across all measurement states. The previous code
  // had a structural branch on `usesMeasuredGeometry` (= `ctx.available > 0`)
  // — when `available` flipped between 0 and a measured value during the
  // post-resize cascade, this Row torn down its subtree and rebuilt it,
  // which reset every descendant useBoxRect measurement and cascaded
  // through ContentContext consumers.
  //
  // Same tree always. Width-derived ternaries above (`available`,
  // `middleAvailable`, `width`) feed in the resolved values so the layout
  // is correct in both pre-measurement (=0 → laneWidth fallback) and
  // measured (>0 → real available) states. ContentRowContext value of 0
  // when not measured is provided as before for downstream lanes that
  // care.
  const middleAvailableForRow = usesMeasuredGeometry ? middleWidth : 0
  // Stop propagating measured pixel widths upward through `width=`. An
  // explicit `width={middleWidth}` is a load-bearing feedback edge: an
  // explicit `width` on a flex child changes its main-axis basis, which
  // changes the row's intrinsic size, which the parent's flexbox re-uses on
  // the next convergence pass — visible as the 96↔120 oscillation in the
  // STRICT log. Switching to `maxWidth` (a hint, not authoritative width)
  // lets flexily own the final resolved width and breaks the prop-value
  // feedback edge that survived the Phase 3 stable-tree fix.
  const middleNode = (
    <ContentRowContext.Provider value={{ available: middleAvailableForRow }}>
      <Box
        flexDirection="row"
        flexGrow={1}
        maxWidth={usesMeasuredGeometry ? middleWidth : "100%"}
        minWidth={0}
      >
        {middle}
      </Box>
    </ContentRowContext.Provider>
  )
  const leftSlot =
    usesMeasuredGeometry && hasSideSlots && sideSlotWidth > 0 ? (
      <Box
        width={sideSlotWidth}
        minWidth={0}
        flexDirection="row"
        justifyContent="flex-end"
        overflow="hidden"
      >
        {left}
      </Box>
    ) : null
  const rightSlot =
    usesMeasuredGeometry && hasSideSlots && sideSlotWidth > 0 ? (
      <Box
        width={sideSlotWidth}
        minWidth={0}
        flexDirection="row"
        justifyContent="flex-start"
        overflow="hidden"
      >
        {right}
      </Box>
    ) : null
  const showSpacers = usesMeasuredGeometry && rowAlign === "center"
  return (
    <Box flexDirection="row" alignSelf="stretch" width="100%" minWidth={0} flexShrink={0}>
      {showSpacers && leftSpacer > 0 ? <Box width={leftSpacer} minWidth={0} /> : null}
      {leftSlot}
      {leftSlot && sideGap > 0 ? <Box width={sideGap} minWidth={0} /> : null}
      {middleNode}
      {rightSlot && sideGap > 0 ? <Box width={sideGap} minWidth={0} /> : null}
      {rightSlot}
      {showSpacers && rightSpacer > 0 ? <Box width={rightSpacer} minWidth={0} /> : null}
    </Box>
  )
}

function ProseLane({ children }: { children: React.ReactNode }): React.ReactElement {
  const row = useContext(ContentRowContext)
  const ctx = useContentLayout()
  const available = row?.available ?? ctx.available
  const gutterMinWidth = available > 2 ? 1 : 0
  const proseWidth =
    available > 0 ? Math.max(1, Math.min(ctx.prose, available - gutterMinWidth * 2)) : ctx.prose
  const lane = (
    <Box flexDirection="row" width="100%" minWidth={0}>
      <Box
        width={gutterMinWidth}
        flexGrow={1}
        flexBasis={gutterMinWidth}
        flexShrink={0}
        minWidth={gutterMinWidth}
      />
      <Box flexDirection="column" width={proseWidth} maxWidth={proseWidth} minWidth={0}>
        {children}
      </Box>
      <Box
        width={gutterMinWidth}
        flexGrow={1}
        flexBasis={gutterMinWidth}
        flexShrink={0}
        minWidth={gutterMinWidth}
      />
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
  // Single React tree across all measurement states — no structural branch on
  // `available > 0` (the previous code added/removed `ContentRowContext.Provider`
  // between paints, which the post-resize-ui-stability investigation identified
  // as the same anti-pattern as Row's old `usesMeasuredGeometry` branch — every
  // `0 → N` transition tore down the lane subtree and reset descendant
  // measurements). Width control switches from authoritative `width={width}` to
  // `maxWidth={width}`; Silvery's default shrink lets flexily own the final
  // resolved width. flexily clamps `maxWidth=120` to parent width when the
  // container is narrower than the wide lane.
  const ctx = useContentLayout()
  const row = useContext(ContentRowContext)
  const available = row?.available ?? ctx.available
  const width = available > 0 ? Math.min(ctx.wide, Math.max(1, available - 2)) : ctx.wide
  return (
    <Box
      data-component="content-lane-wide-outer"
      flexDirection="row"
      width="100%"
      justifyContent={laneJustify(ctx.align)}
      minWidth={0}
    >
      <ContentRowContext.Provider value={{ available: width }}>
        {/* overflow="hidden" mirrors the Full lane (below): non-wrapping content
            wider than the lane (long code lines, unbreakable tokens, base64
            image blobs) clips at the lane edge instead of overflowing. Without
            it, such a child trips strictLayoutOverflowCheck and hard-crashes the
            UI under SILVERY_STRICT=2 ("Layout overflow: … content-lane-wide-inner
            … silvery-text"). The strict check exempts overflow:hidden|scroll
            parents. Regression: tests/regressions/wide-lane-overflow-strict-crash. */}
        <Box
          data-component="content-lane-wide-inner"
          flexDirection="column"
          maxWidth={width}
          minWidth={0}
          overflow="hidden"
        >
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
    <Box data-component="content-lane-full-outer" flexDirection="row" width="100%" minWidth={0}>
      {gutterWidth > 0 ? (
        <Box width={gutterWidth} flexShrink={0}>
          <Text> </Text>
        </Box>
      ) : null}
      <Box
        data-component="content-lane-full-inner"
        flexDirection="column"
        flexGrow={1}
        flexBasis={0}
        minWidth={0}
        overflow="hidden"
      >
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

function Body({
  children,
  width = "prose",
  backgroundColor,
  paddingLeft,
  paddingRight,
}: ContentBodyProps): React.ReactElement {
  // Wrap in (padding) → (backgroundColor) layers when either is set.
  // Mirror the existing backgroundColor pattern; padding goes outside so
  // the bg fills the padded area too (consistent with tank-fill semantics
  // on prose surfaces — the gutters are part of the lane, not outside
  // it).
  let body: React.ReactNode = children
  if (
    (paddingLeft !== undefined && paddingLeft > 0) ||
    (paddingRight !== undefined && paddingRight > 0)
  ) {
    body = (
      <Box
        flexDirection="column"
        width="100%"
        minWidth={0}
        paddingLeft={paddingLeft !== undefined && paddingLeft > 0 ? paddingLeft : undefined}
        paddingRight={paddingRight !== undefined && paddingRight > 0 ? paddingRight : undefined}
      >
        {body}
      </Box>
    )
  }
  if (backgroundColor !== undefined) {
    body = (
      <Box flexDirection="column" width="100%" minWidth={0} backgroundColor={backgroundColor}>
        {body}
      </Box>
    )
  }
  // width="auto" snaps the body's inline-size to the smallest fitting lane
  // (prose / wide / full) via flexily's engine-resolved `fitWidth` Box
  // prop. Replaces the previous caller-supplied numeric width hint with
  // intrinsic-driven snap, in a single layout pass.
  if (width === "auto") return <AutoLane>{body}</AutoLane>
  const resolved = resolveBodyWidth(width)
  if (resolved === "full") return <Full>{body}</Full>
  if (resolved === "wide") return <Wide>{body}</Wide>
  return <ProseLane>{body}</ProseLane>
}

/**
 * AutoLane — lane-snapping wrapper used by `<Content.Body width="auto">`.
 *
 * Pulls the lane-snap targets from the surrounding `Content.Layout`
 * context (`ctx.prose`, `ctx.wide`, `ctx.full || row.available`) and
 * delegates the snap to flexily's engine-resolved `fitWidth` Box prop —
 * the layout engine picks the smallest fitting lane in a single pass, no
 * React round-trip. The outer Box mirrors `ProseLane` / `Wide` / `Full`'s
 * row-justify shape so the chosen lane lays out under the same alignment
 * policy as the static lanes.
 *
 * Internal — `<Content.Auto>` is no longer exported. New consumers reach
 * for `<Content.Body width="auto">`; advanced cases that need lane
 * semantics outside Content reach for `<Box fitWidth>` directly.
 */
function AutoLane({ children }: { children: React.ReactNode }): React.ReactElement {
  const ctx = useContentLayout()
  const row = useContext(ContentRowContext)
  const available = row?.available ?? ctx.available
  // Lane set: [prose, wide, full]. flexily picks the smallest lane that
  // fits the content's intrinsic width via `fitWidth`. Content that fits
  // in wide (120) stays in wide (centered); content wider than wide
  // promotes to full.
  //
  // `ctx.full` is the layout's full-lane cap (set to `available` by
  // Layout); when it's 0 (no measurement yet), fall back to the row's
  // available width or `ctx.wide` so the lane set always has a
  // non-degenerate largest entry.
  // The effective content cap reserves one pane-edge cell on each side
  // when auto promotes to the full available width.
  const fullCap = available > 0 ? available : ctx.full || ctx.wide
  const paneContentCap = fullCap > 2 ? fullCap - 2 : fullCap
  const lanes = autoLaneWidths(
    Math.min(ctx.prose, paneContentCap),
    Math.min(ctx.wide, paneContentCap),
    paneContentCap,
  )
  // The visible-tree shape mirrors AutoFit's prior wrap: outer row sets
  // justifyContent so the column claims the row's main-axis; inner column
  // claims the row's full width and lets `alignSelf` on a fitWidth child
  // do the cross-axis (horizontal) centering. Without the column wrap,
  // alignSelf on a child inside the row would map to vertical alignment.
  //
  // The inner column also propagates the parent's available width down to
  // fitWidth's max-content read — without it, fitWidth measures unconstrained
  // but the children's wrap behavior interacts with `width="100%"` ancestors,
  // and the lane choice can disagree with the visible-tree width. The
  // explicit column wrap is the same shape AutoFit shipped — it works.
  const innerAlignSelf = ctx.align === "center" && available > 0 ? "center" : "flex-start"
  return (
    <Box
      data-component="content-lane-auto-outer"
      flexDirection="row"
      width="100%"
      justifyContent={laneJustify(ctx.align)}
      minWidth={0}
    >
      <Box flexDirection="column" width="100%" minWidth={0}>
        <Box
          fitWidth={lanes}
          flexDirection="column"
          alignSelf={innerAlignSelf}
          maxWidth="100%"
          minWidth={0}
        >
          <Box flexDirection="column" minWidth={0}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

type TableAlignment = "left" | "right" | "center" | null
const TABLE_CELL_PADDING_X = 1

function tableNaturalWidths(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): number[] {
  return headers.map((header, col) => {
    const maxRow = rows.reduce((w, row) => Math.max(w, (row[col] ?? "").length), 0)
    return Math.max(header.length, maxRow)
  })
}

function tableFrameWidth(widths: readonly number[], separatorWidth: number): number {
  const paddedCells = widths.reduce((sum, width) => sum + width + TABLE_CELL_PADDING_X * 2, 0)
  return paddedCells + separatorWidth * Math.max(0, widths.length - 1) + 2
}

function shrinkTableWidths(
  widths: readonly number[],
  targetWidth: number,
  separatorWidth: number,
): number[] | null {
  if (widths.length === 0) return []
  const separatorTotal = separatorWidth * Math.max(0, widths.length - 1)
  const paddingTotal = widths.length * TABLE_CELL_PADDING_X * 2
  const availableCells = targetWidth - separatorTotal - paddingTotal - 2
  const minimums = widths.map((width) => Math.min(width, 8))
  const minimumTotal = minimums.reduce((sum, width) => sum + width, 0)
  if (availableCells < minimumTotal) return null

  const out = [...widths]
  let total = out.reduce((sum, width) => sum + width, 0)
  let overflow = total - availableCells
  while (overflow > 0) {
    const candidates = out
      .map((width, index) => ({ width, index, reducible: width - (minimums[index] ?? 0) }))
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
  const separator = "│"
  const naturalWidths = tableNaturalWidths(headers, rows)
  const frameWidth = tableFrameWidth(naturalWidths, separator.length)
  // Silvery Text clips the final border glyph when a table frame exactly fills
  // its wrapping lane; require one spare column so `┐`/`┘` stay visible.
  const rightBorderReserve = 1
  const fullWidth = row?.available ?? ctx.full ?? ctx.available ?? ctx.wide
  const fullLaneWidth = fullWidth > 2 ? fullWidth - 2 : fullWidth
  const lanes: Array<{ width: number; wrap: (children: React.ReactNode) => React.ReactElement }> = [
    { width: ctx.prose, wrap: (children) => <ProseLane>{children}</ProseLane> },
    { width: ctx.wide, wrap: (children) => <Wide>{children}</Wide> },
    { width: fullLaneWidth, wrap: (children) => <Full>{children}</Full> },
  ]

  for (const lane of lanes) {
    if (frameWidth + rightBorderReserve > lane.width) continue
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

  // Shrink-to-fit fallback. The target subtracts an extra 2 cols on top of
  // `fullLaneWidth`'s existing -2 for `Full`'s left/right gutters. The extra
  // 2 cols cover the case where `TableRoot` is rendered INSIDE a parent
  // `Content.Body width="auto"` (= `AutoLane`) — `AutoLane`'s `fitWidth`
  // Box has already snapped to a lane width of `fullLaneWidth`, so wrapping
  // the table in `<Full>` again subtracts another pair of gutters that the
  // shrink target didn't see. Without this, a wide table inside a nested
  // auto-lane parent overflows by exactly 2 cols and the right border
  // (`┐`/`│`/`┘`) gets clipped by `Full`'s `overflow="hidden"`. The fix
  // budgets for one nested `Full` wrapper without breaking the
  // direct-`Content.Layout` callers (where the extra 2-col margin is
  // invisible inside an 80+ col pane).
  const nestedGutterReserve = 2
  const shrinkTarget = Math.max(fullLaneWidth - nestedGutterReserve - rightBorderReserve, 16)
  if (fullLaneWidth >= 64) {
    const widths = shrinkTableWidths(naturalWidths, shrinkTarget, separator.length)
    if (widths) {
      return (
        <Full>
          <TableGridRoot
            headers={headers}
            rows={rows}
            alignments={alignments}
            widths={widths}
            separator={separator}
          />
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
  separator = "│",
}: TableGridProps): React.ReactElement {
  const ctx = useContentLayout()
  const gridWidths = widths ?? tableNaturalWidths(headers, rows)
  const frameWidth = tableFrameWidth(gridWidths, separator.length)
  const gridBoxWidth = frameWidth + 1
  // alignSelf must follow ctx.align so the table center-aligns when the
  // surrounding Content layout center-aligns.
  // Pre-fix the table used `alignSelf="flex-start"` unconditionally — inside
  // `<Full>`'s `flexGrow={1}` inner column, that stuck the table to col 1
  // while prose sat in the centered prose lane. Mirrors what ProseLane and
  // Wide do via `justifyContent={laneJustify(ctx.align)}` on their outers.
  const tableAlignSelf: "flex-start" | "center" = ctx.align === "center" ? "center" : "flex-start"
  const headerRule = gridWidths
    .map((width) => "─".repeat(width + TABLE_CELL_PADDING_X * 2))
    .join("┼")
  const topRule = gridWidths.map((width) => "─".repeat(width + TABLE_CELL_PADDING_X * 2)).join("┬")
  const bottomRule = gridWidths
    .map((width) => "─".repeat(width + TABLE_CELL_PADDING_X * 2))
    .join("┴")
  const renderCells = (cells: readonly string[], bold = false): React.ReactElement[] => {
    const wrapped = headers.map((_, col) => wrapCell(cells[col] ?? "", gridWidths[col] ?? 0))
    const height = Math.max(1, ...wrapped.map((lines) => lines.length))
    return Array.from({ length: height }, (_, lineIndex) => (
      <Text key={lineIndex} wrap={false}>
        <Text color="$border">│</Text>
        {headers.map((_, col) => (
          <React.Fragment key={col}>
            {col > 0 && <Text color="$border">{separator}</Text>}
            <Text bold={bold}>
              {" ".repeat(TABLE_CELL_PADDING_X)}
              {padCellLine(wrapped[col]?.[lineIndex] ?? "", gridWidths[col] ?? 0, alignments[col])}
              {" ".repeat(TABLE_CELL_PADDING_X)}
            </Text>
          </React.Fragment>
        ))}
        <Text color="$border">│</Text>
      </Text>
    ))
  }
  return (
    <Box
      flexDirection="column"
      alignSelf={tableAlignSelf}
      width={gridBoxWidth}
      maxWidth={gridBoxWidth}
    >
      <Text color="$border" wrap={false}>
        ┌{topRule}┐
      </Text>
      {renderCells(headers, true)}
      <Text color="$border" wrap={false}>
        ├{headerRule}┤
      </Text>
      {rows.map((row, rowIdx) => (
        <React.Fragment key={rowIdx}>
          {rowIdx > 0 ? (
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
                <Text bold>{header}:</Text> {row[col] ?? ""}
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
    <Text color="$fg-muted" flexShrink={1} wrap="truncate">
      {children}
    </Text>
  )
  return (
    // flex-ceremony-ok: aside labels truncate inside measured side slots instead of pushing prose.
    <Box
      flexShrink={1}
      minWidth={0}
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
  Table,
  Aside,
  MeasuredPaneScope,
}
