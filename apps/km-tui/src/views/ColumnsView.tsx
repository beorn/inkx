/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 *
 * Uses inkx VirtualList for React-level virtualization of large card lists.
 */
import React, { useCallback, useMemo } from "react"
import { useRepo } from "../repo-context.tsx"
import { Box, Text } from "inkx"
import { createLogger } from "@beorn/logger"

const log = createLogger("km:tui:columns")
import type { TUIBoardState, ColumnState, CardState } from "../types.ts"
import { getNodeDisplayName, isNodeUntitled } from "../state.ts"
import { getOwnColor, getHeaderStyle } from "../board-pills.ts"
import { useTreeRenderContext, deriveColumnExcludedSigils } from "../ui-context.tsx"
import { getNodeIcon, renderPlain } from "../text/index.ts"
import { VerticalScrollIndicator, ColumnSeparator } from "./VerticalScrollIndicator.tsx"
import { calcColumnWidths, getColumnWidth } from "./board-layout.ts"
import { MemoizedTreeCard } from "./shared-components.tsx"
import { useIsColumnSelected, useCursorColIndex } from "../cursor-context.tsx"
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
    treeConfig: { inOutlineMode },
  } = useTreeRenderContext()

  // Subscribe to column selection only (stable on j/k within same column)
  const columnSelected = useIsColumnSelected(colIndex)
  const isSelected = columnSelected.isSelected
  const selectionLevel = columnSelected.selectionLevel

  // Render name with wiki links stripped: [[target|alias]] → "alias"
  const name = renderPlain(getNodeDisplayName(repo, column.node))
  const untitled = isNodeUntitled(repo, column.node)
  const count = column.cards.length
  const ownColor = getOwnColor(column.node)

  // Column header is selected when at column level
  const isColumnHeaderSelected = isSelected && selectionLevel === "column"
  const headerStyle = getHeaderStyle(ownColor, isSelected, isColumnHeaderSelected)

  // Get consistent bullet icon using getNodeIcon (same rules as TreeNode)
  const icon = getNodeIcon(null, ownColor, false)
  const iconColor = isColumnHeaderSelected ? "black" : icon.color

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const columnExcludedSigils = useMemo(() => deriveColumnExcludedSigils(name), [name])
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Stable renderCard callback — doesn't depend on cardIndex.
  // MemoizedTreeCard gets selection state from CursorStore self-subscription.
  const renderCard = useCallback(
    (card: CardState, actualIndex: number) => {
      log.debug?.(`rendering card col=${colIndex} idx=${actualIndex} id=${card.node.id}`)
      return (
        <MemoizedTreeCard
          key={card.node.id}
          card={card}
          colIndex={colIndex}
          cardIndex={actualIndex}
          extraExcludedSigils={extraExcludedSigils}
        />
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
      {/* Header section */}
      <Box flexDirection="column" height={2} flexShrink={0}>
        {/* Header row - backgroundColor on Text ensures fg color applies correctly */}
        <Box>
          <Text bold color={headerStyle.color} backgroundColor={headerStyle.backgroundColor} wrap="truncate">
            {" "}
            <Text color={iconColor}>{icon.char}</Text> {untitled ? <Text dimColor color="gray">{name}</Text> : name}
            <Text
              color={isColumnHeaderSelected ? "gray" : undefined}
              dimColor={!isColumnHeaderSelected}
            >{` (${count})`}</Text>
          </Text>
        </Box>
        <Text dimColor wrap="truncate">
          {"─".repeat(100)}
        </Text>
      </Box>

      {/* Cards with ScrollTrackingVirtualList */}
      {column.cards.length > 0 ? (
        <ScrollTrackingVirtualList
          colIndex={colIndex}
          isSelected={isSelected}
          items={column.cards}
          height={height - 2}
          itemHeight={1}
          overscan={OVERSCAN}
          maxRendered={MAX_RENDERED_ITEMS}
          keyExtractor={(card) => card.node.id}
          renderItem={renderCard}
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
  state: TUIBoardState
  width: number
  height: number
  colIndex: number
  cardIndex: number
  subIndex: number
  effectiveScrollOffset: number
  effectiveMaxCols: number
  effectiveVisibleColumns: ColumnState[]
  selectionLevel: "board" | "column" | "card"
}

// Maximum column width for columns view (tighter than cards view)
const COLUMNS_VIEW_MAX_WIDTH = 50

export function ColumnsView({
  state,
  width,
  height,
  colIndex: _colIndexProp,
  cardIndex: _cardIndexProp,
  subIndex,
  effectiveScrollOffset,
  effectiveMaxCols,
  effectiveVisibleColumns,
  selectionLevel: _selectionLevelProp,
}: ColumnsViewProps): React.ReactElement {
  // Subscribe to colIndex only — ColumnsView doesn't re-render on j/k within column
  const colIndex = useCursorColIndex()
  // Calculate column widths using shared utility
  const widths = calcColumnWidths({
    boardWidth: width,
    visibleColumnCount: effectiveVisibleColumns.length,
    maxCols: effectiveMaxCols,
    scrollOffset: effectiveScrollOffset,
    totalColumns: state.columns.length,
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Blank line between top bar and column headers */}
      <Box height={1} flexShrink={0} />

      {/* Columns row */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Left scroll indicator */}
        {widths.hasLeftIndicator && <VerticalScrollIndicator direction="left" />}

        {/* Columns with tree view inside */}
        {effectiveVisibleColumns.map((col, i) => {
          const actualColIndex = effectiveScrollOffset + i
          const isLastCol = i === effectiveVisibleColumns.length - 1
          const colWidth = getColumnWidth(i, widths.baseColWidth, widths.remainder, COLUMNS_VIEW_MAX_WIDTH)
          log.debug?.(`ColumnsView map: i=${i} actualColIdx=${actualColIndex} colIndex=${colIndex}`)
          return (
            <React.Fragment key={col.node.id}>
              <ColumnTree
                column={col}
                colIndex={actualColIndex}
                selectedSubIndex={subIndex}
                width={colWidth}
                height={height - 1}
              />
              {/* Separator line between columns */}
              {!isLastCol && <ColumnSeparator />}
            </React.Fragment>
          )
        })}

        {/* Right scroll indicator */}
        {widths.hasRightIndicator && <VerticalScrollIndicator direction="right" />}

        {state.columns.length === 0 && <Text dimColor>Empty board</Text>}
      </Box>
    </Box>
  )
}
