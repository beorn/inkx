/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 *
 * Uses silvery HorizontalVirtualList for horizontal column windowing and
 * ListView for React-level virtualization of large card lists.
 */
import React, { useCallback, useMemo } from "react"
import { useRepo } from "../repo-context.tsx"
import { Box, Small, HorizontalVirtualList } from "@silvery/ag-react"
import { createLogger } from "loggily"

const log = createLogger("km:tui:columns")
import type { ColumnView } from "../hooks/use-columns.ts"
import type { KNode } from "@km/core"
import { useTreeRenderContext, deriveColumnExcludedSigils } from "../state/ui-context.tsx"
import { useApp as useAppStore } from "@silvery/create/create-app"
import { Workspace, type BoardAppStore } from "../state/board-app-store.ts"
import { ColumnHeader, deriveColumnHeaderProps } from "./NodeView.tsx"
import { VerticalScrollIndicator } from "./VerticalScrollIndicator.tsx"
import { MemoizedTreeCard } from "./shared-components.tsx"
import { useNodeStore } from "../state/reactive.ts"
import { useSignal } from "../hooks/use-signal.ts"
import { ScrollTrackingVirtualList } from "./ScrollTracker.tsx"

// =============================================================================
// Virtualization Constants
// =============================================================================

/**
 * Number of extra items to render above and below visible area.
 * Higher than CARDS view (15) because items are single-row (smaller).
 */
const OVERSCAN = 20

/**
 * Maximum number of items to render at once.
 * Higher than CARDS view (50) because items are simpler to render
 * (single row, no borders).
 */
const MAX_RENDERED_ITEMS = 100

// =============================================================================
// ColumnTree Subcomponent
// =============================================================================

interface ColumnTreeProps {
  column: ColumnView
  colIndex: number
  width: number
  height: number
}

/**
 * Memoized ColumnTree - does NOT re-render on j/k within the same column.
 *
 * Column subscribes only to column selection state (stable on j/k).
 * ScrollTrackingVirtualList handles cardIndex subscription via ListView.
 * Cards use ReactiveNodeStore self-subscription for selection state.
 */
const ColumnTree = React.memo(function ColumnTree({ column, colIndex, width, height }: ColumnTreeProps) {
  const repo = useRepo()
  const {
    treeConfig: { iconStyle },
  } = useTreeRenderContext()

  // Subscribe to column selection only (stable on j/k within same column)
  const nodeStore = useNodeStore()
  const cursorColumnNodeId = useSignal(nodeStore.cursorColumnNodeId)
  const cursorDepth = useSignal(nodeStore.cursorDepth)
  const isSelected = cursorColumnNodeId === column.node.id

  // Track editing state for dynamic item height (border adds 2 rows)
  const sel = useAppStore<BoardAppStore, import("@silvery/selection").SelectionStore>((s) => s.sel)
  const textEdit = useSignal(sel.text)
  const editingNodeId = (textEdit?.nodeId as string) ?? null

  const count = column.cardNodes.length

  // Column header is selected when at column level
  const isColumnHeaderSelected = isSelected && cursorDepth === "column"

  // Derive column header presentation props (icon, colors, style)
  const { displayName, untitled, ownColor, headerStyle, icon } = deriveColumnHeaderProps(repo, column.node, {
    iconStyle,
    isSelected,
    isColumnSelected: isColumnHeaderSelected,
  })

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(displayName, column.node.id, column.node.fs_path),
    [displayName, column.node.id, column.node.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Stable renderCard callback — doesn't depend on cardIndex.
  // MemoizedTreeCard gets selection state from ReactiveNodeStore self-subscription.
  const renderCard = useCallback(
    (card: KNode, actualIndex: number) => {
      log.debug?.(`rendering card col=${colIndex} idx=${actualIndex} id=${card.id}`)
      return (
        <Box key={`${card.id}-${actualIndex}`} paddingLeft={1}>
          <MemoizedTreeCard
            card={card}
            colIndex={colIndex}
            cardIndex={actualIndex}
            extraExcludedSigils={extraExcludedSigils}
          />
        </Box>
      )
    },
    [colIndex, extraExcludedSigils],
  )

  return (
    <Box
      id={column.node.id}
      data-view="column"
      data-column={true}
      data-col-index={colIndex}
      {...(isSelected && { "data-selected": true })}
      {...(isColumnHeaderSelected && {
        "data-cursor": true,
        "data-card-index": -1,
      })}
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
    >
      {/* Column header — unified NodeView component */}
      <ColumnHeader
        node={column.node}
        displayName={displayName}
        untitled={untitled}
        ownColor={ownColor}
        headerStyle={headerStyle}
        icon={icon}
        cardCount={count}
        width={width}
        isColumnSelected={isColumnHeaderSelected}
        isSelected={isSelected}
        wipLimit={column.wipLimit}
        showSeparator
      />

      {/* Cards with ScrollTrackingVirtualList */}
      {column.cardNodes.length > 0 ? (
        <ScrollTrackingVirtualList
          isSelected={isSelected}
          items={column.cardNodes}
          height={height - 2}
          estimateHeight={(index: number) => (column.cardNodes[index]?.id === editingNodeId ? 3 : 1)}
          overscan={OVERSCAN}
          maxRendered={MAX_RENDERED_ITEMS}
          getKey={(card) => card.id}
          renderItem={renderCard}
          overflowIndicator
        />
      ) : (
        <Box flexDirection="column" flexGrow={1} minHeight={1}>
          <Small>(empty)</Small>
        </Box>
      )}
    </Box>
  )
})

// =============================================================================
// ColumnsView Component
// =============================================================================

interface ColumnsViewProps {
  columns: ColumnView[]
  width: number
  height: number
}

// Maximum column width for columns view (tighter than cards view)
const COLUMNS_VIEW_MAX_WIDTH = 50

export function ColumnsView({ columns, width, height }: ColumnsViewProps): React.ReactElement {
  const nodeStore = useNodeStore()
  const cursorColumnNodeId = useSignal(nodeStore.cursorColumnNodeId)
  const colIndex = useMemo(() => {
    if (!cursorColumnNodeId) return 0
    const idx = columns.findIndex((c) => c.node.id === cursorColumnNodeId)
    return idx >= 0 ? idx : 0
  }, [cursorColumnNodeId, columns])

  // Column width — uniform width capped at COLUMNS_VIEW_MAX_WIDTH.
  // HVL internally reserves space for overflow indicators (overflowIndicatorWidth * 2 = 2).
  // Subtract the same amount here so column widths fit the effective viewport.
  const indicatorReserved = 2
  const usableWidth = width - indicatorReserved
  const maxCols = Math.max(1, Math.floor(usableWidth / 35))
  const effectiveColCount = Math.min(columns.length, maxCols)
  const expandedWidth = Math.min(COLUMNS_VIEW_MAX_WIDTH, Math.max(20, Math.floor(usableWidth / effectiveColCount)))
  const columnHeight = height - 1

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Blank line between top bar and column headers */}
      <Box height={1} flexShrink={0} />

      {/* Columns row — HVL handles horizontal windowing and scroll indicators */}
      {columns.length === 0 ? (
        <Box flexDirection="row" flexGrow={1}>
          <Small>Empty board</Small>
        </Box>
      ) : (
        <HorizontalVirtualList
          items={columns}
          width={width}
          height={columnHeight}
          itemWidth={expandedWidth}
          scrollTo={colIndex}
          renderItem={(col, index) => (
            <ColumnTree column={col} colIndex={index} width={expandedWidth} height={columnHeight} />
          )}
          renderOverflowIndicator={(dir, hiddenCount) => (
            <VerticalScrollIndicator direction={dir === "before" ? "left" : "right"} hiddenCount={hiddenCount} />
          )}
          overflowIndicatorWidth={1}
          getKey={(col) => col.node.id}
        />
      )}
    </Box>
  )
}
