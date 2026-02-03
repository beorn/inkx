/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 *
 * Uses inkx VirtualList for React-level virtualization of large card lists.
 */
import React, { useRef, forwardRef, useImperativeHandle, useCallback } from "react"
import { useRepo } from "../repo-context.tsx"
import { Box, Text, VirtualList, type VirtualListHandle } from "inkx"
import { createConditionalLogger } from "@beorn/logger"

const log = createConditionalLogger("km:tui:columns")
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
// Handle Interfaces
// =============================================================================

export interface ColumnTreeHandle {
  scrollToItem(index: number): void
}

// =============================================================================
// Virtualization Constants
// =============================================================================

// Number of extra items to render above and below visible area
const OVERSCAN = 20

// Maximum number of items to render at once
const MAX_RENDERED_ITEMS = 100


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
const ColumnTree = React.memo(
  forwardRef<ColumnTreeHandle, ColumnTreeProps>(function ColumnTree(
    {
      column,
      colIndex,
      isSelected,
      selectedCardIndex,
      selectedSubIndex,
      selectionLevel,
      width,
      height,
    },
    ref,
  ) {
    const listRef = useRef<VirtualListHandle>(null)

    // Forward scrollToItem to VirtualList
    useImperativeHandle(ref, () => ({
      scrollToItem(index: number) {
        listRef.current?.scrollToItem(index)
      },
    }))

    const repo = useRepo()
    const { inOutlineMode } = useTreeConfig()

    // Render name with wiki links stripped: [[target|alias]] → "alias"
    const name = renderPlain(getNodeDisplayName(repo, column.node))
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

    // Render item callback for VirtualList
    const renderCard = useCallback(
      (card: CardState, actualIndex: number) => {
        const isCardSelected =
          selectionLevel === "card" &&
          isSelected &&
          actualIndex === selectedCardIndex &&
          (!inOutlineMode || selectedSubIndex === 0)

        log.debug?.(
          `rendering card col=${colIndex} idx=${actualIndex} id=${card.node.id}`,
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
      },
      [colIndex, isSelected, selectedCardIndex, selectedSubIndex, selectionLevel, inOutlineMode],
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

        {/* Cards with inkx VirtualList */}
        {column.cards.length > 0 ? (
          <VirtualList
            ref={listRef}
            items={column.cards}
            height={height - 2}
            itemHeight={1}
            scrollTo={isSelected ? selectedCardIndex : undefined}
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
  }),
)

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
