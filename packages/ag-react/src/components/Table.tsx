/**
 * Generic tabular layout with one Flexily-owned track geometry path.
 *
 * The default presentation is the compact data table used by applications.
 * `frame` adds document-table chrome and wrapping without introducing another
 * width allocator: both presentations share the same tracks and cells.
 */
import React, { useMemo } from "react"
import { displayWidth } from "@silvery/ag-term/unicode"
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
  /** Smallest total width Flexily may assign to this track. */
  minWidth?: number
  /** Largest total width Flexily may assign to this track. */
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
  basis: number
  fixed: boolean
}>

function trackAt(tracks: readonly Track[], index: number): Track {
  const track = tracks[index]
  if (track === undefined) throw new RangeError(`Missing table track ${index}`)
  return track
}

function clamp(value: number, min: number, max: number | undefined): number {
  return Math.max(min, max === undefined ? value : Math.min(value, max))
}

function plainCellValue<T>(column: Column<T>, item: T, index: number): string {
  if (column.render) {
    const rendered = column.render(item, index)
    if (typeof rendered === "string" || typeof rendered === "number") return String(rendered)
  }
  return column.key ? String(item[column.key] ?? "") : ""
}

function computeTracks<T>(
  columns: readonly Column<T>[],
  data: readonly T[],
  padding: number,
  columnSeparators: boolean,
): Track[] {
  return columns.map((column, columnIndex) => {
    const separatorWidth = columnSeparators && columnIndex > 0 ? 1 : 0
    if (column.width !== undefined) {
      return { basis: column.width + separatorWidth, fixed: true }
    }
    const contentWidth = Math.max(
      displayWidth(column.header),
      ...data.map((item, itemIndex) => displayWidth(plainCellValue(column, item, itemIndex))),
    )
    const intrinsic = contentWidth + padding + separatorWidth
    return {
      basis: clamp(intrinsic, column.minWidth ?? 0, column.maxWidth),
      fixed: false,
    }
  })
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
    () => computeTracks(columns, data, padding, framed),
    [columns, data, framed, padding],
  )
  const borderColor = "$border"
  const ruleColor = presentation === "document" ? "$border-muted" : borderColor
  const leftPadding = directRows ? Math.floor(padding / 2) : 0
  const rightPadding = directRows ? padding - leftPadding : padding

  const trackProps = (column: Column<T>, track: Track) => {
    const canShrink = column.shrink ?? column.grow ?? false
    return track.fixed
      ? {
          width: track.basis,
          minWidth: track.basis,
          maxWidth: track.basis,
          flexGrow: 0,
          flexShrink: 0,
        }
      : {
          flexBasis: track.basis,
          minWidth: column.minWidth ?? 0,
          maxWidth: column.maxWidth,
          flexGrow: column.grow ? 1 : 0,
          // Flexbox scales shrink by both flexShrink and flexBasis. Using the
          // basis again makes long tracks yield quadratically before compact
          // identifier/status tracks disappear.
          flexShrink: canShrink ? track.basis : 0,
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
        <Text minWidth={0} maxWidth="100%" wrap={cellWrap}>
          {rendered == null ? String((column.key ? item[column.key] : "") ?? "") : String(rendered)}
        </Text>
      )
    return (
      <Box
        key={column.header}
        {...trackProps(column, track)}
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
          {...trackProps(column, trackAt(tracks, columnIndex))}
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
    const intrinsicWidth = tracks.reduce((sum, track) => sum + track.basis, 0) + (framed ? 2 : 0)
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
