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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box } from "./Box"
import { Text } from "./Text"
import { ListView, type FollowPolicy, type ListItemMeta } from "../ui/components/ListView"

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

export type TableRowId = string | number

type TableBaseProps<T> = {
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

type PassiveTableProps<T> = TableBaseProps<T> & {
  /** Keep the historical, byte-identical display-only Table. */
  interactive?: false
}

export type InteractiveTableProps<T> = TableBaseProps<T> & {
  /** Enable ListView-owned row cursor, navigation, pointer, and activation behavior. */
  interactive: true
  /** Stable identity used for the cursor, anchoring, and ListView item keys. */
  getRowId: (row: T, index: number) => TableRowId
  /** Controlled cursor identity. */
  cursorId?: TableRowId
  /** Initial cursor identity for an uncontrolled Table. */
  defaultCursorId?: TableRowId
  /** Called when the stable cursor identity changes. */
  onCursorIdChange?: (id: TableRowId | null) => void
  /** Called once when Enter or a row click activates a row. */
  onActivate?: (row: T) => void
  /** Whether this Table owns keyboard input. Default: true. */
  active?: boolean
  /** Bounded data-row viewport height. Defaults to the data row count. */
  height?: number
  /** Follow the live tail until navigation or scrolling anchors the viewport. */
  follow?: FollowPolicy
  /** Changing scope/filter identity acknowledges the current anchor baseline. */
  anchorKey?: TableRowId
}

export type TableProps<T> = PassiveTableProps<T> | InteractiveTableProps<T>

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

export function Table<T>(props: TableProps<T>): React.ReactElement {
  const { data, columns, headerColor = "$fg-accent", showHeader = true, padding = 2 } = props
  const interactive = props.interactive === true
  const getRowId = interactive ? props.getRowId : undefined
  const requestedFollow = interactive ? (props.follow ?? "none") : "none"
  const controlledCursorId = interactive ? props.cursorId : undefined
  const defaultCursorId = interactive ? props.defaultCursorId : undefined
  const onCursorIdChange = interactive ? props.onCursorIdChange : undefined
  const onActivate = interactive ? props.onActivate : undefined
  const currentAnchorKey = interactive ? props.anchorKey : undefined
  const isCursorControlled = interactive && controlledCursorId !== undefined

  const rowIds = useMemo(
    () => (getRowId ? data.map((row, index) => getRowId(row, index)) : []),
    [data, getRowId],
  )
  const [uncontrolledCursorId, setUncontrolledCursorId] = useState<TableRowId | undefined>(() => {
    if (!interactive) return undefined
    if (controlledCursorId !== undefined) return controlledCursorId
    if (defaultCursorId !== undefined) return defaultCursorId
    if (rowIds.length === 0) return undefined
    return requestedFollow === "end" ? rowIds[rowIds.length - 1] : rowIds[0]
  })
  const selectedCursorId = isCursorControlled ? controlledCursorId : uncontrolledCursorId
  const lastCursorIndexRef = useRef(0)
  const selectedIndex = rowIds.findIndex((id) => id === selectedCursorId)
  const cursorIndex =
    selectedIndex >= 0
      ? selectedIndex
      : rowIds.length === 0
        ? 0
        : Math.max(0, Math.min(lastCursorIndexRef.current, rowIds.length - 1))
  if (selectedIndex >= 0) lastCursorIndexRef.current = selectedIndex

  const startsFollowing =
    requestedFollow === "end" &&
    (rowIds.length === 0
      ? selectedCursorId === undefined
      : selectedCursorId === rowIds[rowIds.length - 1])
  const [isFollowing, setIsFollowing] = useState(startsFollowing)
  const followingRef = useRef(startsFollowing)

  // If an uncontrolled row disappears, keep the prior numeric slot rather
  // than jumping to an unrelated edge. The next render stores that row's ID,
  // so subsequent reshuffles remain identity-stable again.
  const fallbackCursorId = rowIds[cursorIndex]
  useEffect(() => {
    if (!interactive || isCursorControlled || selectedIndex >= 0) return
    if (requestedFollow === "end" && followingRef.current) return
    if (uncontrolledCursorId === fallbackCursorId) return
    setUncontrolledCursorId(fallbackCursorId)
    onCursorIdChange?.(fallbackCursorId ?? null)
  }, [
    fallbackCursorId,
    interactive,
    isCursorControlled,
    onCursorIdChange,
    requestedFollow,
    selectedIndex,
    uncontrolledCursorId,
  ])

  // Follow/anchor is ID-based. Entering anchor mode snapshots the IDs that
  // existed at that moment; later reshuffles and removals do not inflate the
  // count, while genuinely unseen IDs do. Reaching the live edge acknowledges
  // the snapshot and resumes ListView's canonical follow="end" machinery.
  const anchorIdsRef = useRef<ReadonlySet<TableRowId>>(new Set(rowIds))
  const previousAnchorKeyRef = useRef<TableRowId | undefined>(currentAnchorKey)
  if (previousAnchorKeyRef.current !== currentAnchorKey) {
    previousAnchorKeyRef.current = currentAnchorKey
    anchorIdsRef.current = new Set(rowIds)
  }

  const updateFollowing = useCallback(
    (next: boolean) => {
      if (followingRef.current === next) {
        if (next) anchorIdsRef.current = new Set(rowIds)
        return
      }
      anchorIdsRef.current = new Set(rowIds)
      followingRef.current = next
      setIsFollowing(next)
    },
    [rowIds],
  )

  // When a followed Table mounts empty, acquire the tail of its first batch.
  // Later appends leave this stable-ID selection alone: ListView follow owns
  // the viewport, while the cursor remains a selection marker.
  useEffect(() => {
    if (!interactive || isCursorControlled || requestedFollow !== "end") return
    if (!followingRef.current || rowIds.length === 0) return
    if (selectedCursorId !== undefined) return
    const tailIndex = rowIds.length - 1
    const tailId = rowIds[tailIndex]
    if (tailId === undefined) return
    lastCursorIndexRef.current = tailIndex
    setUncontrolledCursorId(tailId)
    onCursorIdChange?.(tailId)
  }, [interactive, isCursorControlled, onCursorIdChange, requestedFollow, rowIds, selectedCursorId])

  const previousRequestedFollowRef = useRef(requestedFollow)
  useEffect(() => {
    if (previousRequestedFollowRef.current === requestedFollow) return
    previousRequestedFollowRef.current = requestedFollow
    updateFollowing(requestedFollow === "end")
  }, [requestedFollow, updateFollowing])

  const newRowCount =
    interactive && requestedFollow === "end" && !isFollowing
      ? rowIds.reduce<number>((count, id) => count + (anchorIdsRef.current.has(id) ? 0 : 1), 0)
      : 0

  const handleCursor = useCallback(
    (index: number) => {
      if (!interactive) return
      const id = rowIds[index]
      if (id === undefined) return
      lastCursorIndexRef.current = index
      if (!isCursorControlled) setUncontrolledCursorId(id)
      onCursorIdChange?.(id)
      if (requestedFollow === "end") updateFollowing(index === rowIds.length - 1)
    },
    [interactive, isCursorControlled, onCursorIdChange, requestedFollow, rowIds, updateFollowing],
  )
  const handleActivate = useCallback(
    (index: number) => {
      if (!interactive) return
      const row = data[index]
      if (row !== undefined) onActivate?.(row)
    },
    [data, interactive, onActivate],
  )

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
          <Box height={1} minWidth={0} flexGrow={1} flexShrink={1} overflow="hidden">
            {rendered}
          </Box>
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
            height={1}
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

  const renderRow = (item: T, index: number, meta: ListItemMeta) => (
    <Box
      width="100%"
      height={1}
      minWidth={0}
      flexShrink={0}
      overflow="hidden"
      backgroundColor={interactive && meta.isCursor ? "$bg-selected" : undefined}
      color={interactive && meta.isCursor ? "$fg-on-selected" : undefined}
    >
      {columns.map((col, colIndex) =>
        renderCell(col, item, index, tracks[colIndex]!, colIndex === columns.length - 1),
      )}
    </Box>
  )

  // Viewport height = number of data rows (show all, no scrolling)
  // Minimum 1 to avoid zero-height viewport when data is empty
  const viewportHeight =
    interactive && props.height !== undefined ? props.height : Math.max(data.length, 1)
  const listInteractionProps = interactive
    ? {
        nav: true,
        active: props.active,
        getKey: props.getRowId,
        cursorKey: cursorIndex,
        onCursor: handleCursor,
        onSelect: handleActivate,
        follow: requestedFollow === "end" && isFollowing ? ("end" as const) : ("none" as const),
        onAtBottomChange:
          requestedFollow === "end" ? (atBottom: boolean) => updateFollowing(atBottom) : undefined,
      }
    : {}

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
        <ListView
          items={data}
          height={viewportHeight}
          estimateHeight={1}
          renderItem={renderRow}
          {...listInteractionProps}
        />
      )}
      {newRowCount > 0 && (
        <Box height={1} flexShrink={0} justifyContent="flex-end">
          <Text color="$fg-muted">{newRowCount} new</Text>
        </Box>
      )}
    </Box>
  )
}
