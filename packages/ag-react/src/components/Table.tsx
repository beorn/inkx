/**
 * Table Component
 *
 * A generic data table with auto-sizing columns, custom renderers, and alignment.
 * Thin composition over ListView — each data row is a ListView item, column headers
 * are rendered above. Gets nav/cache/search from ListView for free.
 *
 * @example
 * ```tsx
 * <Table
 *   columns={[
 *     { header: "Name", key: "name" },
 *     { header: "Age", key: "age", align: "right" },
 *     { header: "Bio", key: "bio", grow: true },
 *   ]}
 *   data={[
 *     { name: "Alice", age: 30 },
 *     { name: "Bob", age: 25 },
 *   ]}
 * />
 * ```
 */
import React, { useMemo } from "react"
import { Box } from "./Box"
import { Text } from "./Text"
import { ListView } from "../ui/components/ListView"

// =============================================================================
// Types
// =============================================================================

export type Column<T> = {
  /** Column header text */
  header: string
  /** Key to read from data item (simple string access) */
  key?: keyof T & string
  /** Custom render function (takes precedence over key) */
  render?: (item: T, index: number) => React.ReactNode
  /** Text alignment: left (default) or right */
  align?: "left" | "right"
  /** Fixed width (overrides auto-sizing) */
  width?: number
  /** Smallest width Flexily may assign to this column */
  minWidth?: number
  /** Largest width Flexily may assign to this column */
  maxWidth?: number
  /** Allow this column to grow to fill remaining space */
  grow?: boolean
}

export const TABLE_CELL_PREFIX = Symbol("table-cell-prefix")

export type InternalColumn<T> = Column<T> & {
  [TABLE_CELL_PREFIX]?: (
    item: T,
    index: number,
  ) => Readonly<{ text: string; node: React.ReactNode }> | undefined
}

export type TableProps<T> = {
  /** Data rows */
  data: readonly T[]
  /** Column definitions */
  columns: readonly Column<T>[]
  /** Header text color (default: "$fg-accent") */
  headerColor?: string
  /** Show header row (default: true) */
  showHeader?: boolean
  /** Minimum column padding between columns (default: 2) */
  padding?: number
}

// =============================================================================
// Helpers
// =============================================================================

type Track = Readonly<{
  basis: number
  fixed: boolean
}>

function clamp(value: number, min: number, max: number | undefined): number {
  return Math.max(min, max === undefined ? value : Math.min(value, max))
}

function computeTracks<T>(
  columns: readonly Column<T>[],
  data: readonly T[],
  padding: number,
): Track[] {
  return columns.map((col) => {
    if (col.width !== undefined) return { basis: col.width, fixed: true }
    const cellValues = data.map((item, i) => {
      const prefix = (col as InternalColumn<T>)[TABLE_CELL_PREFIX]?.(item, i)?.text ?? ""
      if (col.render) {
        const rendered = col.render(item, i)
        if (typeof rendered === "string") return prefix + rendered
        // Styled cells can still share the plain value used by their column.
        if (col.key) return prefix + String(item[col.key] ?? "")
        return prefix
      }
      return prefix + String((col.key ? item[col.key] : "") ?? "")
    })
    const intrinsic = Math.max(col.header.length, ...cellValues.map((v) => v.length)) + padding
    return {
      basis: clamp(intrinsic, col.minWidth ?? 0, col.maxWidth),
      fixed: false,
    }
  })
}

// =============================================================================
// Component
// =============================================================================

export function Table<T>({
  data,
  columns,
  headerColor = "$fg-accent",
  showHeader = true,
  padding = 2,
}: TableProps<T>): React.ReactElement {
  const tracks = useMemo(() => computeTracks(columns, data, padding), [columns, data, padding])

  const trackProps = (col: Column<T>, track: Track) =>
    track.fixed
      ? {
          width: track.basis,
          minWidth: track.basis,
          maxWidth: track.basis,
          flexGrow: 0,
          flexShrink: 0,
        }
      : {
          flexBasis: track.basis,
          minWidth: col.minWidth ?? 0,
          maxWidth: col.maxWidth,
          flexGrow: col.grow ? 1 : 0,
          // Only a grow column gives way under overflow. Shrinking every track
          // proportionally to its basis crushes small fixed siblings into
          // one-glyph stubs the moment one long cell overflows the container;
          // a column that declared no flexibility keeps its content width and
          // the terminal edge truncates the flexible one instead.
          flexShrink: col.grow ? 1 : 0,
        }

  const renderCell = (col: Column<T>, item: T, index: number, track: Track, last: boolean) => {
    const prefix = (col as InternalColumn<T>)[TABLE_CELL_PREFIX]?.(item, index)
    const rendered = col.render ? col.render(item, index) : null
    const content =
      rendered != null ? (
        typeof rendered === "string" ? (
          <Text minWidth={0} maxWidth={prefix ? undefined : "100%"} wrap="truncate">
            {rendered}
          </Text>
        ) : (
          rendered
        )
      ) : (
        <Text minWidth={0} maxWidth={prefix ? undefined : "100%"} wrap="truncate">
          {String((col.key ? item[col.key] : "") ?? "")}
        </Text>
      )

    return (
      <Box
        key={col.header}
        {...trackProps(col, track)}
        overflow="hidden"
        paddingRight={last ? 0 : padding}
        justifyContent={col.align === "right" ? "flex-end" : undefined}
      >
        {prefix ? (
          <Box
            width="100%"
            minWidth={0}
            overflow="hidden"
            justifyContent={col.align === "right" ? "flex-end" : undefined}
          >
            {prefix.node}
            {content}
          </Box>
        ) : (
          content
        )}
      </Box>
    )
  }

  const renderRow = (item: T, index: number) => (
    <Box width="100%" minWidth={0} overflow="hidden">
      {columns.map((col, colIndex) =>
        renderCell(col, item, index, tracks[colIndex]!, colIndex === columns.length - 1),
      )}
    </Box>
  )

  // Viewport height = number of data rows (show all, no scrolling)
  // Minimum 1 to avoid zero-height viewport when data is empty
  const viewportHeight = Math.max(data.length, 1)

  return (
    <Box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      {showHeader && (
        <Box width="100%" minWidth={0} overflow="hidden">
          {columns.map((col, i) => (
            <Box
              key={col.header}
              {...trackProps(col, tracks[i]!)}
              overflow="hidden"
              paddingRight={i === columns.length - 1 ? 0 : padding}
              justifyContent={col.align === "right" ? "flex-end" : undefined}
            >
              <Text bold color={headerColor} minWidth={0} maxWidth="100%" wrap="truncate">
                {col.header}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      {data.length > 0 && (
        <ListView items={data} height={viewportHeight} estimateHeight={1} renderItem={renderRow} />
      )}
    </Box>
  )
}
