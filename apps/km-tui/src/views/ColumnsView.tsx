/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 * Implements React-level virtualization for large card lists.
 */
import React, { useMemo, useRef } from "react"
import { useVault } from "../vault-context.tsx"
import { Box, Text } from "inkx"
import createDebug from "debug"

const debugCol = createDebug("km:tui:columns")
import type { TUIBoardState, ColumnState, CardState } from "../types.ts"
import { getNodeDisplayName } from "../state.ts"
import { getOwnColor, getHeaderStyle } from "../board-pills.ts"
import { useTreeConfig } from "../ui-context.tsx"
import { getNodeIcon, renderPlain } from "../text/index.ts"
import {
  VerticalScrollIndicator,
  ColumnSeparator,
} from "./VerticalScrollIndicator.tsx"
import { MemoizedTreeCard } from "./shared-components.tsx"

// =============================================================================
// Virtualization Constants
// =============================================================================

// Approximate row height for tree items
const ESTIMATED_ROW_HEIGHT = 1

// Number of extra items to render above and below visible area
// Increased from 10 to 20 to prevent blank rendering during scroll
// when edge-based scrolling preserves offset near window boundaries
const OVERSCAN = 20

// Maximum number of items to render at once
const MAX_RENDERED_ITEMS = 100

// Padding from edge before scrolling (in items)
const SCROLL_PADDING = 2

// =============================================================================
// Virtualized Tree Card List Component
// =============================================================================

interface VirtualizedTreeCardListProps {
  cards: CardState[]
  selectedCardIndex: number
  selectedSubIndex: number
  isSelected: boolean
  selectionLevel: "board" | "column" | "card"
  colIndex: number
  inOutlineMode: boolean
  height: number
}

/**
 * Calculate edge-based scroll offset.
 * Only scrolls when cursor approaches the edge of the visible area.
 */
function calcEdgeBasedScrollOffset(
  selectedIndex: number,
  currentOffset: number,
  visibleCount: number,
  totalCount: number,
): number {
  if (totalCount <= visibleCount) return 0

  const visibleStart = currentOffset
  const visibleEnd = currentOffset + visibleCount - 1
  const paddedStart = visibleStart + SCROLL_PADDING
  const paddedEnd = visibleEnd - SCROLL_PADDING

  let newOffset = currentOffset

  if (selectedIndex < paddedStart) {
    newOffset = Math.max(0, selectedIndex - SCROLL_PADDING)
  } else if (selectedIndex > paddedEnd) {
    newOffset = Math.min(
      totalCount - visibleCount,
      selectedIndex - visibleCount + SCROLL_PADDING + 1,
    )
  }

  return Math.max(0, Math.min(newOffset, totalCount - visibleCount))
}

/**
 * Virtualized list of tree cards that only renders items near the visible area.
 * Uses edge-based scrolling (only scrolls when cursor approaches edge).
 */
function VirtualizedTreeCardList({
  cards,
  selectedCardIndex,
  selectedSubIndex,
  isSelected,
  selectionLevel,
  colIndex,
  inOutlineMode,
  height,
}: VirtualizedTreeCardListProps): React.ReactElement {
  // Track scroll offset for edge-based scrolling
  const scrollOffsetRef = useRef(0)

  // Calculate how many items fit in the viewport
  const visibleItemCount = Math.max(
    1,
    Math.floor(height / ESTIMATED_ROW_HEIGHT),
  )

  // Calculate edge-based scroll offset
  const newScrollOffset = calcEdgeBasedScrollOffset(
    selectedCardIndex,
    scrollOffsetRef.current,
    visibleItemCount,
    cards.length,
  )
  scrollOffsetRef.current = newScrollOffset

  // Calculate virtualization window
  const {
    startIndex,
    endIndex,
    topPlaceholderHeight,
    bottomPlaceholderHeight,
  } = useMemo(() => {
    const totalCards = cards.length

    // For small lists, render everything
    if (totalCards <= MAX_RENDERED_ITEMS) {
      return {
        startIndex: 0,
        endIndex: totalCards,
        topPlaceholderHeight: 0,
        bottomPlaceholderHeight: 0,
      }
    }

    // Center the window around the selected card
    const halfWindow = Math.floor(MAX_RENDERED_ITEMS / 2)
    let start = Math.max(0, selectedCardIndex - halfWindow)
    let end = Math.min(totalCards, start + MAX_RENDERED_ITEMS)

    // Adjust start if we hit the end
    if (end === totalCards) {
      start = Math.max(0, end - MAX_RENDERED_ITEMS)
    }

    // Add overscan
    start = Math.max(0, start - OVERSCAN)
    end = Math.min(totalCards, end + OVERSCAN)

    // Calculate placeholder heights
    const topHeight = start * ESTIMATED_ROW_HEIGHT
    const bottomHeight = (totalCards - end) * ESTIMATED_ROW_HEIGHT

    return {
      startIndex: start,
      endIndex: end,
      topPlaceholderHeight: topHeight,
      bottomPlaceholderHeight: bottomHeight,
    }
  }, [cards.length, selectedCardIndex])

  if (cards.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} minHeight={1}>
        <Text dimColor>(empty)</Text>
      </Box>
    )
  }

  // Get the slice of cards to render
  const visibleCards = cards.slice(startIndex, endIndex)

  // Calculate scrollTo index using edge-based offset
  const hasTopPlaceholder = topPlaceholderHeight > 0
  const scrollToIndex =
    newScrollOffset - startIndex + (hasTopPlaceholder ? 1 : 0)

  return (
    <Box
      flexDirection="column"
      height={height}
      overflow="scroll"
      scrollTo={Math.max(0, scrollToIndex)}
    >
      {/* Top placeholder */}
      {topPlaceholderHeight > 0 && (
        <Box height={topPlaceholderHeight} flexShrink={0} />
      )}

      {/* Render visible cards */}
      {visibleCards.map((card: CardState, i: number) => {
        const actualIndex = startIndex + i
        const isCardSelected =
          selectionLevel === "card" &&
          isSelected &&
          actualIndex === selectedCardIndex &&
          (!inOutlineMode || selectedSubIndex === 0)

        debugCol(
          "rendering card col=%d idx=%d id=%s",
          colIndex,
          actualIndex,
          card.node.id,
        )
        return (
          <MemoizedTreeCard
            key={card.node.id}
            card={card}
            colIndex={colIndex}
            cardIndex={actualIndex}
            isSelected={isCardSelected}
          />
        )
      })}

      {/* Bottom placeholder */}
      {bottomPlaceholderHeight > 0 && (
        <Box height={bottomPlaceholderHeight} flexShrink={0} />
      )}
    </Box>
  )
}

// =============================================================================
// ColumnTree Subcomponent
// =============================================================================

interface ColumnTreeProps {
  column: ColumnState
  colIndex: number
  isSelected: boolean
  selectedCardIndex: number
  selectedSubIndex: number
  selectionLevel: "board" | "column" | "card"
  width: number
  height: number
}

/**
 * Memoized ColumnTree - skips re-render when column state unchanged.
 */
const ColumnTree = React.memo(function ColumnTree({
  column,
  colIndex,
  isSelected,
  selectedCardIndex,
  selectedSubIndex,
  selectionLevel,
  width,
  height,
}: ColumnTreeProps): React.ReactElement {
  const vault = useVault()
  const { inOutlineMode } = useTreeConfig()

  // Render name with wiki links stripped: [[target|alias]] → "alias"
  const name = renderPlain(getNodeDisplayName(vault, column.node))
  const count = column.cards.length
  const ownColor = getOwnColor(column.node)

  // Column header is selected when at column level
  const isColumnHeaderSelected = isSelected && selectionLevel === "column"
  const headerStyle = getHeaderStyle(
    ownColor,
    isSelected,
    isColumnHeaderSelected,
  )

  // Get consistent bullet icon using getNodeIcon (same rules as TreeNode)
  const icon = getNodeIcon(null, ownColor, false)
  const iconColor = isColumnHeaderSelected ? "black" : icon.color

  return (
    <Box
      id={column.node.id}
      data-view="column"
      data-selected={isSelected}
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
    >
      {/* Header section */}
      <Box flexDirection="column" height={2} flexShrink={0}>
        {/* Header row - backgroundColor on Text ensures fg color applies correctly */}
        <Box>
          <Text
            bold
            color={headerStyle.color}
            backgroundColor={headerStyle.backgroundColor}
            wrap="truncate"
          >
            {" "}
            <Text color={iconColor}>{icon.char}</Text> {name}
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

      {/* Cards with virtualized rendering */}
      <VirtualizedTreeCardList
        cards={column.cards}
        selectedCardIndex={selectedCardIndex}
        selectedSubIndex={selectedSubIndex}
        isSelected={isSelected}
        selectionLevel={selectionLevel}
        colIndex={colIndex}
        inOutlineMode={inOutlineMode}
        height={height - 2}
      />
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

export function ColumnsView({
  state,
  width,
  height,
  colIndex,
  cardIndex,
  subIndex,
  effectiveScrollOffset,
  effectiveMaxCols,
  effectiveVisibleColumns,
  selectionLevel,
}: ColumnsViewProps): React.ReactElement {
  const hasLeftIndicator = effectiveScrollOffset > 0
  const hasRightIndicator =
    effectiveScrollOffset + effectiveMaxCols < state.columns.length

  // Calculate column widths with max width constraint
  // Tighter than cards view to prevent columns from being too wide
  const maxColWidth = 50
  const indicatorWidth =
    (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0)
  const separatorCount = effectiveVisibleColumns.length - 1
  const availableWidth = width - indicatorWidth - separatorCount
  const baseColWidth = Math.floor(availableWidth / effectiveMaxCols)
  const remainder = availableWidth % effectiveMaxCols

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Blank line between top bar and column headers */}
      <Box height={1} flexShrink={0} />

      {/* Columns row */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Left scroll indicator */}
        {hasLeftIndicator && <VerticalScrollIndicator direction="left" />}

        {/* Columns with tree view inside */}
        {effectiveVisibleColumns.map((col, i) => {
          const actualColIndex = effectiveScrollOffset + i
          const isLastCol = i === effectiveVisibleColumns.length - 1
          // Distribute extra pixels to the first 'remainder' columns, then cap at maxColWidth
          const rawColWidth = baseColWidth + (i < remainder ? 1 : 0)
          const colWidth = Math.min(rawColWidth, maxColWidth)
          return (
            <React.Fragment key={col.node.id}>
              <ColumnTree
                column={col}
                colIndex={actualColIndex}
                isSelected={actualColIndex === colIndex}
                selectedCardIndex={cardIndex}
                selectedSubIndex={subIndex}
                selectionLevel={selectionLevel}
                width={colWidth}
                height={height - 1}
              />
              {/* Separator line between columns */}
              {!isLastCol && <ColumnSeparator />}
            </React.Fragment>
          )
        })}

        {/* Right scroll indicator */}
        {hasRightIndicator && <VerticalScrollIndicator direction="right" />}

        {state.columns.length === 0 && <Text dimColor>Empty board</Text>}
      </Box>
    </Box>
  )
}
