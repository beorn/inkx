/**
 * Tabs View Component
 *
 * Similar to list view but with tab-based navigation between columns.
 * Only shows one column at a time with tabs at the top for switching.
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 */
import React from "react"
import { Box, Text } from "inkx"
import type { TUIBoardState } from "../types.ts"
import { getNodeDisplayName } from "../state.ts"
import { useTreeConfig } from "../ui-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { MemoizedTreeCard } from "./shared-components.tsx"

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
  colIndex,
  cardIndex,
  subIndex,
  selectionLevel,
}: TabsViewProps): React.ReactElement {
  const repo = useRepo()
  const { inOutlineMode } = useTreeConfig()

  // Get current column
  const currentColumn = state.columns[colIndex]
  const count = currentColumn?.cards.length ?? 0

  // Column header is selected when at column level
  const isColumnHeaderSelected = selectionLevel === "column"

  return (
    <Box
      flexDirection="column"
      width={width}
      maxHeight={height}
      overflow="hidden"
    >
      {/* Spacer line between top bar and tabs */}
      <Box height={1} flexShrink={0} />

      {/* Tab bar - horizontal tabs with content-based widths */}
      {/* Each tab width = max(10, content length) + padding, extra space goes to right */}
      <Box flexDirection="row" width={width} height={1} flexShrink={0}>
        {state.columns.map((column, cIdx) => {
          const isActive = cIdx === colIndex
          const colName = getNodeDisplayName(repo, column.node)
          const colCount = column.cards.length
          const countStr = ` (${colCount})`

          // Tab content: " name (count) " with min width of 10 chars for the name
          const minNameWidth = 10
          const displayName = colName.length > minNameWidth ? colName : colName
          // Truncate if name exceeds reasonable width (20 chars)
          const maxNameWidth = 20
          const truncatedName =
            displayName.length > maxNameWidth
              ? displayName.slice(0, maxNameWidth - 1) + "\u2026"
              : displayName

          // Style like cards view column headers
          const isTabSelected = isActive && isColumnHeaderSelected
          const isBoardLevel = selectionLevel === "board"
          const showActiveHighlight = isActive && !isBoardLevel

          const textColor = isTabSelected
            ? "black"
            : showActiveHighlight
              ? "yellow"
              : "white"

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
                <Text
                  bold
                  color={textColor}
                  dimColor={!showActiveHighlight && selectionLevel === "board"}
                >
                  {" "}
                  {truncatedName}
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

      {/* Content area with inkx native scrolling */}
      <Box flexDirection="column" width={width} flexGrow={1} minHeight={1}>
        {currentColumn ? (
          count > 0 ? (
            <Box
              flexDirection="column"
              flexGrow={1}
              minHeight={1}
              overflow="scroll"
              scrollTo={cardIndex}
            >
              {currentColumn.cards.map((card, actualCardIndex) => {
                const isCardSelected =
                  selectionLevel === "card" &&
                  actualCardIndex === cardIndex &&
                  (!inOutlineMode || subIndex === 0)

                return (
                  <MemoizedTreeCard
                    key={card.node.id}
                    card={card}
                    colIndex={colIndex}
                    cardIndex={actualCardIndex}
                    isSelected={isCardSelected}
                  />
                )
              })}
            </Box>
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
