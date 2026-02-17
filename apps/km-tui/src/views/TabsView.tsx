/**
 * Tabs View Component
 *
 * Similar to list view but with tab-based navigation between columns.
 * Only shows one column at a time with tabs at the top for switching.
 *
 * Uses inkx VirtualList for React-level virtualization.
 */
import React, { useMemo } from "react"
import { Box, Text, VirtualList } from "inkx"
import type { TUIBoardState, CardState } from "../types.ts"
import { getNodeDisplayName, isNodeUntitled } from "../state.ts"
import { useTreeRenderContext, deriveColumnExcludedSigils } from "../ui-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { renderPlain } from "../text/index.ts"
import { MemoizedTreeCard } from "./shared-components.tsx"
import { useCursorPosition } from "../cursor-context.tsx"
import { useUISelector } from "../ui-context.tsx"

// Virtualization constants
const OVERSCAN = 10
const MAX_RENDERED_ITEMS = 100

interface TabsViewProps {
  state: TUIBoardState
  width: number
  height: number
  colIndex: number
  cardIndex: number
  subIndex: number
  selectionLevel: "board" | "column" | "card"
}

export function TabsView({
  state,
  width,
  height,
  colIndex: _colIndexProp,
  cardIndex: _cardIndexProp,
  subIndex,
  selectionLevel: _selectionLevelProp,
}: TabsViewProps): React.ReactElement {
  const repo = useRepo()
  const {
    treeConfig: { inOutlineMode },
  } = useTreeRenderContext()

  // Use CursorStore for cursor position (self-subscription, bypasses Board re-render)
  const cursorPos = useCursorPosition()
  const colIndex = cursorPos.colIndex
  const cardIndex = cursorPos.cardIndex
  const selectionLevel = cursorPos.selectionLevel

  // Track editing state for dynamic item height (border adds 2 rows)
  const editingNodeId = useUISelector((s) => s.inlineEditBlock?.nodeId ?? null)

  // Get current column
  const currentColumn = state.columns[colIndex]
  const count = currentColumn?.cards.length ?? 0

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const colName = currentColumn ? renderPlain(getNodeDisplayName(repo, currentColumn.node)) : ""
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(colName, currentColumn?.node.id, currentColumn?.node.fs_path),
    [colName, currentColumn?.node.id, currentColumn?.node.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Column header is selected when at column level
  const isColumnHeaderSelected = selectionLevel === "column"

  return (
    <Box flexDirection="column" width={width} maxHeight={height} overflow="hidden">
      {/* Spacer line between top bar and tabs */}
      <Box height={1} flexShrink={0} />

      {/* Tab bar - horizontal tabs with content-based widths */}
      {/* Each tab width = max(10, content length) + padding, extra space goes to right */}
      <Box flexDirection="row" width={width} height={1} flexShrink={0}>
        {state.columns.map((column, cIdx) => {
          const isActive = cIdx === colIndex
          const colName = getNodeDisplayName(repo, column.node)
          const untitled = isNodeUntitled(repo, column.node)
          const colCount = column.cards.length
          const countStr = ` (${colCount})`

          // Truncate if name exceeds reasonable width (20 chars)
          const maxNameWidth = 20
          const truncatedName = colName.length > maxNameWidth ? colName.slice(0, maxNameWidth - 1) + "\u2026" : colName

          // Style like cards view column headers
          const isTabSelected = isActive && isColumnHeaderSelected
          const showActiveHighlight = isActive && selectionLevel !== "board"

          const textColor = isTabSelected ? "black" : showActiveHighlight ? "yellow" : "white"

          return (
            <React.Fragment key={column.node.id}>
              {/* Tab with background - content-based width */}
              <Box
                id={column.node.id}
                backgroundColor={isTabSelected ? "yellow" : undefined}
                {...(isTabSelected && {
                  "data-cursor": true,
                  "data-col-index": cIdx,
                  "data-card-index": -1,
                })}
              >
                <Text bold color={textColor} dimColor={!showActiveHighlight && selectionLevel === "board"}>
                  {" "}
                  {untitled ? (
                    <Text dimColor color="gray">
                      {truncatedName}
                    </Text>
                  ) : (
                    truncatedName
                  )}
                  <Text dimColor={!isTabSelected}>{countStr}</Text>{" "}
                </Text>
              </Box>
              {/* Separator with space padding */}
              {cIdx < state.columns.length - 1 && <Text dimColor> │ </Text>}
            </React.Fragment>
          )
        })}
        {/* Flex space on the right */}
        <Box flexGrow={1} />
      </Box>

      {/* Top border only */}
      <Box height={1} flexShrink={0}>
        <Text dimColor>{"─".repeat(width)}</Text>
      </Box>

      {/* Content area with virtualized rendering */}
      <Box flexDirection="column" width={width} flexGrow={1} minHeight={1}>
        {currentColumn ? (
          count > 0 ? (
            <VirtualList
              items={currentColumn.cards}
              height={height - 3}
              itemHeight={(card: CardState) => (card.node.id === editingNodeId ? 3 : 1)}
              scrollTo={cardIndex}
              overscan={OVERSCAN}
              maxRendered={MAX_RENDERED_ITEMS}
              keyExtractor={(card) => card.node.id}
              renderItem={(card: CardState, actualCardIndex: number) => {
                const isCardSelected =
                  selectionLevel === "card" && actualCardIndex === cardIndex && (!inOutlineMode || subIndex === 0)

                return (
                  <MemoizedTreeCard
                    key={card.node.id}
                    card={card}
                    colIndex={colIndex}
                    cardIndex={actualCardIndex}
                    isSelected={isCardSelected}
                    extraExcludedSigils={extraExcludedSigils}
                  />
                )
              }}
            />
          ) : (
            <Box marginLeft={1}>
              <Text dimColor>(empty)</Text>
            </Box>
          )
        ) : (
          <Text dimColor>No column selected</Text>
        )}
      </Box>
    </Box>
  )
}
