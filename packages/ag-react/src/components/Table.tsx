/**
 * Generic tabular layout with one Flexily-owned track geometry path.
 *
 * The default presentation is the compact data table used by applications.
 * `frame` adds document-table chrome and wrapping without introducing another
 * width allocator: both presentations share the same tracks and cells.
 *
 * Column widths come from the shared `apportion()` allocator (@silvery/ag):
 * each track carries a [min-content, max-content] band and the measured
 * container width is distributed css-tables-3 style — shrink proportional to
 * shrinkability, floors respected, house-monotone integer rounding. When even
 * the floors do not fit, wrap-capable columns degrade legibly to
 * character-level wrapping and re-allocate; when nothing fits, cells fall
 * back to truncation with visible loss marking. The table never silently
 * renders an allocation that violates its own floors while looking fine.
 */
import React, { useMemo } from "react"
import { apportion, TRACK_BAND_ATTR, type ApportionTrack } from "@silvery/ag"
import { displayWidth, intrinsicWidths } from "@silvery/ag-term/unicode"
import { useBoxRectDangerously } from "../hooks/useLayout"
import { Box } from "./Box"
import { Text, type TextProps } from "./Text"
import { ListView } from "../ui/components/ListView"

export type Column<T> = {
  /** Column header text. */
  header: string
  /** Key to read from the data item. */
  key?: keyof T & string
  /** Custom renderer; a returned string also participates in intrinsic sizing. */
  render?: (item: T, index: number) => React.ReactNode
  /** Text alignment. */
  align?: "left" | "right" | "center"
  /** Fixed total track width. */
  width?: number
  /** Smallest total width the allocator may assign to this track. */
  minWidth?: number
  /** Largest total width the allocator may assign to this track. */
  maxWidth?: number
  /** Allow this track to consume positive free space. */
  grow?: boolean
  /** Allow this track to yield under negative free space. */
  shrink?: boolean
}

export type TableProps<T> = {
  data: readonly T[]
  columns: readonly Column<T>[]
  headerColor?: string
  showHeader?: boolean
  /** Total horizontal padding per cell (default 2). */
  padding?: number
  /** Draw document-table chrome and direct rows instead of a ListView. */
  frame?: boolean
  /** Body-cell overflow behavior (default truncate). */
  cellWrap?: TextProps["wrap"]
  /** Draw rules between direct body rows. */
  rowSeparators?: boolean
}

type TablePresentation = "plain" | "framed" | "document"

type TableImplementationProps<T> = Omit<TableProps<T>, "frame"> & {
  presentation: TablePresentation
}

export function Table<T>({ frame = false, ...props }: TableProps<T>): React.ReactElement {
  return <TableImplementation {...props} presentation={frame ? "framed" : "plain"} />
}

/** @internal Document chrome for Content.Table; intentionally not re-exported from the package API. */
export function DocumentTable<T>(props: Omit<TableProps<T>, "frame">): React.ReactElement {
  return <TableImplementation {...props} presentation="document" />
}

type Track = Readonly<{
  /** Band floor: min-content + chrome (or the author's explicit floor if larger). */
  min: number
  /** Band cap: max-content + chrome, capped by an explicit maxWidth. */
  max: number
  /** Cell chrome inside the track: padding + column separator. */
  chrome: number
  /** Explicit author width — the band is a single point and never degrades. */
  fixed: boolean
}>

type Allocation = Readonly<{
  widths: readonly number[]
  /** True when floors only fit after degrading wrap-capable cells to character wrapping. */
  degraded: boolean
}>

function trackAt(tracks: readonly Track[], index: number): Track {
  const track = tracks[index]
  if (track === undefined) throw new RangeError(`Missing table track ${index}`)
  return track
}

function plainCellValue<T>(column: Column<T>, item: T, index: number): string {
  if (column.render) {
    const rendered = column.render(item, index)
    if (typeof rendered === "string" || typeof rendered === "number") return String(rendered)
  }
  return column.key ? String(item[column.key] ?? "") : ""
}

/** Wrap modes whose min-content is the longest unbreakable segment (they cannot mark loss). */
function isWrapCapable(cellWrap: TextProps["wrap"]): boolean {
  return !(
    cellWrap === "truncate" ||
    cellWrap === "truncate-start" ||
    cellWrap === "truncate-middle" ||
    cellWrap === "truncate-end" ||
    cellWrap === "clip" ||
    cellWrap === false ||
    cellWrap === "hard"
  )
}

function computeTracks<T>(
  columns: readonly Column<T>[],
  data: readonly T[],
  padding: number,
  columnSeparators: boolean,
  cellWrap: TextProps["wrap"],
): Track[] {
  return columns.map((column, columnIndex) => {
    const separatorWidth = columnSeparators && columnIndex > 0 ? 1 : 0
    const chrome = padding + separatorWidth
    if (column.width !== undefined) {
      const total = column.width + separatorWidth
      return { min: total, max: total, chrome, fixed: true }
    }
    // Intrinsic sizing reads the RENDERED cell text (a render() that returns a
    // string participates), never the source data — a cell rendering a long
    // source down to a short label must not inflate the floor.
    let minContent = intrinsicWidths(column.header, "truncate").minContentWidth
    let maxContent = displayWidth(column.header)
    for (let itemIndex = 0; itemIndex < data.length; itemIndex++) {
      const value = plainCellValue(column, data[itemIndex]!, itemIndex)
      const iw = intrinsicWidths(value, cellWrap)
      if (iw.minContentWidth > minContent) minContent = iw.minContentWidth
      if (iw.maxContentWidth > maxContent) maxContent = iw.maxContentWidth
    }
    const max = Math.min(maxContent + chrome, column.maxWidth ?? Number.MAX_SAFE_INTEGER)
    const min = Math.min(Math.max(minContent + chrome, column.minWidth ?? 0), max)
    return { min, max, chrome, fixed: false }
  })
}

/**
 * Allocate the measured width across tracks, escalating LEGIBLY when the
 * floors do not fit:
 *
 * 1. Bands as computed — the normal case.
 * 2. Floors exceed the width: wrap-capable tracks drop their floor to one
 *    cell (character wrapping can break anywhere) and re-allocate. The
 *    degradation is visible — text breaks mid-word — never a silent squeeze
 *    below a floor.
 * 3. Even one-cell floors do not fit: no legal allocation exists. Returns
 *    null; cells fall back to flex truncation, whose ellipsis marks the loss.
 */
function allocateTracks(
  tracks: readonly Track[],
  available: number,
  cellWrap: TextProps["wrap"],
): Allocation | null {
  if (tracks.length === 0) return null
  const bands: ApportionTrack[] = tracks.map((track) => ({ min: track.min, max: track.max }))
  const first = apportion(bands, available)
  if (first.feasible) return { widths: first.widths, degraded: false }

  if (isWrapCapable(cellWrap)) {
    const degradedBands: ApportionTrack[] = tracks.map((track) =>
      track.fixed
        ? { min: track.min, max: track.max }
        : { min: Math.min(track.chrome + 1, track.max), max: track.max },
    )
    const second = apportion(degradedBands, available)
    if (second.feasible) return { widths: second.widths, degraded: true }
  }
  return null
}

function TableRule({ color }: { color: string }): React.ReactElement {
  return (
    <Box
      height={1}
      alignSelf="stretch"
      flexShrink={0}
      borderStyle="single"
      borderColor={color}
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
    />
  )
}

function TableImplementation<T>({
  data,
  columns,
  headerColor = "$fg-accent",
  showHeader = true,
  padding = 2,
  cellWrap = "truncate",
  rowSeparators = false,
  presentation,
}: TableImplementationProps<T>): React.ReactElement {
  const directRows = presentation !== "plain"
  const framed = presentation === "framed"
  const tracks = useMemo(
    () => computeTracks(columns, data, padding, framed, cellWrap),
    [cellWrap, columns, data, framed, padding],
  )
  // The committed inner rect of the CONTAINING Box (NodeContext) — the width
  // the table is being laid into. Batch-invariant, so allocating from it
  // cannot oscillate: a content-sized parent measures Σmax, and
  // apportion(Σmax) returns exactly the max widths — a fixpoint.
  const container = useBoxRectDangerously()
  const available = container.width > 0 ? container.width - (framed ? 2 : 0) : null
  const allocation = useMemo(
    () => (available === null ? null : allocateTracks(tracks, available, cellWrap)),
    [available, cellWrap, tracks],
  )
  const borderColor = "$border"
  const ruleColor = presentation === "document" ? "$border-muted" : borderColor
  const leftPadding = directRows ? Math.floor(padding / 2) : 0
  const rightPadding = directRows ? padding - leftPadding : padding
  const bodyWrap: TextProps["wrap"] = allocation?.degraded ? "hard" : cellWrap

  // The band the allocator worked under, carried onto the rendered track so the
  // `apportion-bands` STRICT check can compare the width the layout engine
  // actually realized against the width the allocation promised. The flex props
  // below are exactly where that promise can be broken — a `grow` track carries
  // no maxWidth, and the unmeasured/no-legal-allocation fallback floors tracks
  // at the author's minWidth rather than the track's own min-content.
  const trackProps = (column: Column<T>, track: Track, columnIndex: number) => ({
    [TRACK_BAND_ATTR]: `${track.min},${track.max}`,
    ...trackFlexProps(column, track, columnIndex),
  })

  const trackFlexProps = (column: Column<T>, track: Track, columnIndex: number) => {
    if (track.fixed) {
      return {
        width: track.max,
        minWidth: track.max,
        maxWidth: track.max,
        flexGrow: 0,
        flexShrink: 0,
      }
    }
    if (allocation !== null) {
      const width = allocation.widths[columnIndex]!
      // Grow columns keep taking positive free space beyond their allocation.
      return column.grow
        ? { flexBasis: width, minWidth: width, flexGrow: 1, flexShrink: 0 }
        : { width, minWidth: width, maxWidth: width, flexGrow: 0, flexShrink: 0 }
    }
    // Unmeasured first frame, or no legal allocation exists (hard overflow):
    // natural-width tracks that flex-shrink linearly; overflow="hidden" plus
    // truncation marks the loss. Shrink weight is the band's shrinkability so
    // rigid tracks hold and prose yields — same model as the allocator.
    const canShrink = column.shrink ?? column.grow ?? false
    return {
      flexBasis: track.max,
      minWidth: column.minWidth ?? 0,
      maxWidth: column.maxWidth,
      flexGrow: column.grow ? 1 : 0,
      flexShrink: canShrink ? Math.max(track.max - track.min, 1) : 0,
    }
  }

  const cellBorderProps = (columnIndex: number) =>
    framed && columnIndex > 0
      ? {
          borderStyle: "single" as const,
          borderColor,
          borderTop: false,
          borderRight: false,
          borderBottom: false,
        }
      : {}

  const cellJustify = (column: Column<T>) =>
    column.align === "right"
      ? ("flex-end" as const)
      : column.align === "center"
        ? ("center" as const)
        : undefined

  const renderCell = (
    column: Column<T>,
    item: T,
    itemIndex: number,
    track: Track,
    columnIndex: number,
  ) => {
    const rendered = column.render ? column.render(item, itemIndex) : null
    const content =
      rendered != null && typeof rendered !== "string" && typeof rendered !== "number" ? (
        rendered
      ) : (
        <Text minWidth={0} maxWidth="100%" wrap={bodyWrap}>
          {rendered == null ? String((column.key ? item[column.key] : "") ?? "") : String(rendered)}
        </Text>
      )
    return (
      <Box
        key={column.header}
        {...trackProps(column, track, columnIndex)}
        {...cellBorderProps(columnIndex)}
        overflow="hidden"
        paddingLeft={leftPadding}
        paddingRight={rightPadding}
        justifyContent={cellJustify(column)}
      >
        {content}
      </Box>
    )
  }

  const renderRow = (item: T, itemIndex: number) => (
    <Box
      key={itemIndex}
      flexDirection="row"
      width="100%"
      alignSelf={directRows ? "stretch" : undefined}
      minWidth={0}
      overflow="hidden"
    >
      {columns.map((column, columnIndex) =>
        renderCell(column, item, itemIndex, trackAt(tracks, columnIndex), columnIndex),
      )}
    </Box>
  )

  const header = showHeader ? (
    <Box
      flexDirection="row"
      width="100%"
      alignSelf={directRows ? "stretch" : undefined}
      minWidth={0}
      overflow="hidden"
    >
      {columns.map((column, columnIndex) => (
        <Box
          key={column.header}
          {...trackProps(column, trackAt(tracks, columnIndex), columnIndex)}
          {...cellBorderProps(columnIndex)}
          overflow="hidden"
          paddingLeft={leftPadding}
          paddingRight={rightPadding}
          justifyContent={cellJustify(column)}
        >
          <Text bold color={headerColor} minWidth={0} maxWidth="100%" wrap="truncate">
            {column.header}
          </Text>
        </Box>
      ))}
    </Box>
  ) : null

  if (directRows) {
    const intrinsicWidth =
      (allocation === null
        ? tracks.reduce((sum, track) => sum + track.max, 0)
        : allocation.widths.reduce((sum, width) => sum + width, 0)) + (framed ? 2 : 0)
    return (
      <Box
        data-component="content-table-grid"
        flexDirection="column"
        width={intrinsicWidth}
        maxWidth="100%"
        minWidth={0}
        marginLeft="auto"
        marginRight="auto"
        borderStyle={framed ? "single" : undefined}
        borderColor={framed ? borderColor : undefined}
        overflow="hidden"
      >
        {header}
        {header && data.length > 0 ? <TableRule color={ruleColor} /> : null}
        {data.map((item, itemIndex) => (
          <React.Fragment key={itemIndex}>
            {rowSeparators && itemIndex > 0 ? <TableRule color={ruleColor} /> : null}
            {renderRow(item, itemIndex)}
          </React.Fragment>
        ))}
      </Box>
    )
  }

  const viewportHeight = Math.max(data.length, 1)
  return (
    <Box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      {header}
      {data.length > 0 && (
        <ListView items={data} height={viewportHeight} estimateHeight={1} renderItem={renderRow} />
      )}
    </Box>
  )
}
