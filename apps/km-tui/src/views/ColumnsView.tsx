/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 *
 * Uses inkx HorizontalVirtualList for horizontal column windowing and
 * VirtualList for React-level virtualization of large card lists.
 */
import React, { useCallback, useMemo } from "react"
import { useRepo } from "../repo-context.tsx"
import { Box, Text, HorizontalVirtualList } from "inkx"
import { createLogger } from "@beorn/logger"

const log = createLogger("km:tui:columns")
import type { ColumnState, CardState } from "../types.ts"
import { useTreeRenderContext, deriveColumnExcludedSigils, useUISelector } from "../ui-context.tsx"
import { ColumnHeader, deriveColumnHeaderProps } from "./NodeView.tsx"
import { VerticalScrollIndicator, ColumnSeparator } from "./VerticalScrollIndicator.tsx"
import { MemoizedTreeCard } from "./shared-components.tsx"
import { useIsColumnSelectedByNode, useCursorColumnNodeId } from "../cursor-context.tsx"
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
  column: ColumnState
  colIndex: number
  selectedSubIndex: number
  width: number
  height: number
}

/**
 * Memoized ColumnTree - does NOT re-render on j/k within the same column.
 *
 * Column subscribes only to column selection state (stable on j/k).
 * ScrollTrackingVirtualList handles cardIndex subscription.
 * Cards use CursorStore self-subscription for selection state.
 */
const ColumnTree = React.memo(function ColumnTree({
  column,
  colIndex,
  selectedSubIndex,
  width,
  height,
}: ColumnTreeProps) {
  const repo = useRepo()
  const {
    treeConfig: { inOutlineMode, iconStyle },
  } = useTreeRenderContext()

  // Subscribe to column selection only (stable on j/k within same column)
  // NODE MODEL V2: Self-select by nodeId instead of positional index.
  const columnSelected = useIsColumnSelectedByNode(column.node.id)
  const isSelected = columnSelected.isSelected
  const selectionLevel = columnSelected.selectionLevel

  // Track editing state for dynamic item height (border adds 2 rows)
  const editingNodeId = useUISelector((s) => s.inlineEditBlock?.nodeId ?? null)

  const count = column.cards.length

  // Column header is selected when at column level
  const isColumnHeaderSelected = isSelected && selectionLevel === "column"

  // Derive column header presentation props (icon, colors, style)
  const { displayName, untitled, ownColor, headerStyle, icon, hasBody } = deriveColumnHeaderProps(repo, column.node, {
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
  // MemoizedTreeCard gets selection state from CursorStore self-subscription.
  const renderCard = useCallback(
    (card: CardState, actualIndex: number) => {
      log.debug?.(`rendering card col=${colIndex} idx=${actualIndex} id=${card.node.id}`)
      return (
        <Box key={`${card.node.id}-${actualIndex}`} paddingLeft={1}>
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
        hasBody={hasBody}
        showSeparator
      />

      {/* Cards with ScrollTrackingVirtualList */}
      {column.cards.length > 0 ? (
        <ScrollTrackingVirtualList
          isSelected={isSelected}
          items={column.cards}
          height={height - 2}
          itemHeight={(card: CardState) => (card.node.id === editingNodeId ? 3 : 1)}
          overscan={OVERSCAN}
          maxRendered={MAX_RENDERED_ITEMS}
          keyExtractor={(card) => card.node.id}
          renderItem={renderCard}
          overflowIndicator
        />
      ) : (
        <Box flexDirection="column" flexGrow={1} minHeight={1}>
          <Text dimColor>(empty)</Text>
        </Box>
      )}
    </Box>
  )
})

// =============================================================================
// ColumnsView Component
// =============================================================================

interface ColumnsViewProps {
  columns: ColumnState[]
  width: number
  height: number
  subIndex: number
}

// Maximum column width for columns view (tighter than cards view)
const COLUMNS_VIEW_MAX_WIDTH = 50

export function ColumnsView({ columns, width, height, subIndex }: ColumnsViewProps): React.ReactElement {
  // NODE MODEL V2: Use cursorColumnNodeId to derive colIndex from columns array
  const cursorColumnNodeId = useCursorColumnNodeId()
  const colIndex = useMemo(() => {
    if (!cursorColumnNodeId) return 0
    const idx = columns.findIndex((c) => c.node.id === cursorColumnNodeId)
    return idx >= 0 ? idx : 0
  }, [cursorColumnNodeId, columns])

  // Column width — uniform width capped at COLUMNS_VIEW_MAX_WIDTH
  const maxCols = Math.max(1, Math.floor(width / 35))
  const effectiveColCount = Math.min(columns.length, maxCols)
  const separators = Math.max(0, effectiveColCount - 1)
  const expandedWidth = Math.min(
    COLUMNS_VIEW_MAX_WIDTH,
    Math.max(20, Math.floor((width - separators) / effectiveColCount)),
  )
  const columnHeight = height - 1

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Blank line between top bar and column headers */}
      <Box height={1} flexShrink={0} />

      {/* Columns row — HVL handles horizontal windowing and scroll indicators */}
      {columns.length === 0 ? (
        <Box flexDirection="row" flexGrow={1}>
          <Text dimColor>Empty board</Text>
        </Box>
      ) : (
        <HorizontalVirtualList
          items={columns}
          width={width}
          height={columnHeight}
          itemWidth={expandedWidth}
          gap={1}
          scrollTo={colIndex}
          renderItem={(col, index) => (
            <ColumnTree
              column={col}
              colIndex={index}
              selectedSubIndex={subIndex}
              width={expandedWidth}
              height={columnHeight}
            />
          )}
          renderOverflowIndicator={(dir) => <VerticalScrollIndicator direction={dir === "before" ? "left" : "right"} />}
          overflowIndicatorWidth={1}
          renderSeparator={() => <ColumnSeparator />}
          keyExtractor={(col) => col.node.id}
        />
      )}
    </Box>
  )
}
