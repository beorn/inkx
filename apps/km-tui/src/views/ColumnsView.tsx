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
import type { TUIBoardState, ColumnState, CardState } from "../types.ts"
import { getNodeDisplayName, isNodeUntitled } from "../state.ts"
import { getOwnColor, getHeaderStyle } from "../board-pills.ts"
import { useTreeRenderContext, deriveColumnExcludedSigils } from "../ui-context.tsx"
import { getColumnHeaderIcon, isSigilName, renderPlain } from "../text/index.ts"
import { VerticalScrollIndicator, ColumnSeparator } from "./VerticalScrollIndicator.tsx"
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
    treeConfig: { inOutlineMode, iconStyle },
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

  const icon = getColumnHeaderIcon(column.node, iconStyle, false, ownColor)
  const iconColor = isColumnHeaderSelected ? "black" : icon.color

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(name, column.node.id, column.node.fs_path),
    [name, column.node.id, column.node.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Stable renderCard callback — doesn't depend on cardIndex.
  // MemoizedTreeCard gets selection state from CursorStore self-subscription.
  const renderCard = useCallback(
    (card: CardState, actualIndex: number) => {
      log.debug?.(`rendering card col=${colIndex} idx=${actualIndex} id=${card.node.id}`)
      // Body blocks (isVirtual) get extra spacing via marginBottom
      const isBody = card.isVirtual
      return (
        <Box key={card.node.id} paddingLeft={1} marginBottom={isBody ? 1 : 0}>
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
      {/* Header section */}
      <Box flexDirection="column" height={2} flexShrink={0}>
        {/* Header row - spacer boxes simulate card border for matching inverse width */}
        <Box flexDirection="row">
          <Box width={1} flexShrink={0} />
          <Box flexGrow={1} flexDirection="row" backgroundColor={headerStyle.backgroundColor}>
            <Box flexGrow={1} flexShrink={1} overflow="hidden">
              <Text bold color={headerStyle.color} wrap="truncate">
                <Text color={iconColor}>{icon.char}</Text>{" "}
                <Text color={isColumnHeaderSelected ? undefined : ownColor}>
                  {untitled ? (
                    <Text dimColor color="gray">
                      {name}
                    </Text>
                  ) : (
                    name
                  )}
                  {isSigilName(column.node.name) && column.node.name !== name && (
                    <>
                      {" "}
                      <Text dimColor>{column.node.name}</Text>
                    </>
                  )}
                </Text>
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Text bold color={headerStyle.color}>
                <Text color={isColumnHeaderSelected ? "gray" : ownColor} dimColor>
                  {` ${count}`}
                </Text>
              </Text>
            </Box>
          </Box>
          <Box width={1} flexShrink={0} />
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
          itemHeight={(card) => (card.isVirtual ? 2 : 1)}
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
  state: TUIBoardState
  width: number
  height: number
  subIndex: number
}

// Maximum column width for columns view (tighter than cards view)
const COLUMNS_VIEW_MAX_WIDTH = 50

export function ColumnsView({
  state,
  width,
  height,
  subIndex,
}: ColumnsViewProps): React.ReactElement {
  // Subscribe to colIndex only — ColumnsView doesn't re-render on j/k within column
  const colIndex = useCursorColIndex()

  // Column width — uniform width capped at COLUMNS_VIEW_MAX_WIDTH
  const maxCols = Math.max(1, Math.floor(width / 35))
  const effectiveColCount = Math.min(state.columns.length, maxCols)
  const separators = Math.max(0, effectiveColCount - 1)
  const expandedWidth = Math.min(COLUMNS_VIEW_MAX_WIDTH, Math.max(20, Math.floor((width - separators) / effectiveColCount)))
  const columnHeight = height - 1

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Blank line between top bar and column headers */}
      <Box height={1} flexShrink={0} />

      {/* Columns row — HVL handles horizontal windowing and scroll indicators */}
      {state.columns.length === 0 ? (
        <Box flexDirection="row" flexGrow={1}>
          <Text dimColor>Empty board</Text>
        </Box>
      ) : (
        <HorizontalVirtualList
          items={state.columns}
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
          renderOverflowIndicator={(dir) => (
            <VerticalScrollIndicator direction={dir === "before" ? "left" : "right"} />
          )}
          overflowIndicatorWidth={1}
          renderSeparator={() => <ColumnSeparator />}
          keyExtractor={(col) => col.node.id}
        />
      )}
    </Box>
  )
}
