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
import type { ColumnState, CardState } from "../types.ts"
import { getNodeDisplayName, isNodeUntitled } from "../state.ts"
import { useTreeRenderContext, deriveColumnExcludedSigils } from "../ui-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { renderPlain } from "../text/index.ts"
import { MemoizedTreeCard } from "./shared-components.tsx"
import { NodeTabView } from "./NodeView.tsx"
import { useCursorNodePosition } from "../cursor-context.tsx"
import { useUISelector } from "../ui-context.tsx"

// Virtualization constants
const OVERSCAN = 10
const MAX_RENDERED_ITEMS = 100

interface TabsViewProps {
  columns: ColumnState[]
  width: number
  height: number
  subIndex: number
}

export function TabsView({ columns: columnsProp, width, height, subIndex }: TabsViewProps): React.ReactElement {
  const repo = useRepo()
  const {
    treeConfig: { inOutlineMode },
  } = useTreeRenderContext()

  // NODE MODEL V2: Use node-based cursor position instead of indices
  const cursorPos = useCursorNodePosition()
  const { cursorCardNodeId, cursorColumnNodeId, selectionLevel } = cursorPos

  // Derive colIndex from cursorColumnNodeId for tab highlighting and column lookup
  const colIndex = useMemo(() => {
    if (!cursorColumnNodeId) return 0
    const idx = columnsProp.findIndex((c) => c.node.id === cursorColumnNodeId)
    return idx >= 0 ? idx : 0
  }, [cursorColumnNodeId, columnsProp])

  // Track editing state for dynamic item height (border adds 2 rows)
  const editingNodeId = useUISelector((s) => s.inlineEditBlock?.nodeId ?? null)

  // Get current column
  const currentColumn = columnsProp[colIndex]
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
        {columnsProp.map((column, cIdx) => {
          const isActive = cIdx === colIndex
          const colName = getNodeDisplayName(repo, column.node)
          const untitled = isNodeUntitled(repo, column.node)
          const colCount = column.cards.length
          const showActiveHighlight = isActive && selectionLevel !== "board"
          const isTabSelected = isActive && isColumnHeaderSelected

          return (
            <React.Fragment key={`${column.node.id}-${cIdx}`}>
              <Box
                id={column.node.id}
                {...(isTabSelected && {
                  "data-cursor": true,
                  "data-col-index": cIdx,
                  "data-card-index": -1,
                })}
              >
                <NodeTabView
                  node={column.node}
                  displayName={colName}
                  isActive={showActiveHighlight}
                  isSelected={isTabSelected}
                  untitled={untitled}
                  count={colCount}
                  dimInactive={selectionLevel === "board"}
                />
              </Box>
              {/* Separator with space padding */}
              {cIdx < columnsProp.length - 1 && <Text dimColor> │ </Text>}
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
              scrollTo={
                cursorCardNodeId ? currentColumn.cards.findIndex((c) => c.node.id === cursorCardNodeId) : undefined
              }
              overscan={OVERSCAN}
              maxRendered={MAX_RENDERED_ITEMS}
              keyExtractor={(card) => card.node.id}
              renderItem={(card: CardState, actualCardIndex: number) => {
                const isCardSelected =
                  selectionLevel === "card" && card.node.id === cursorCardNodeId && (!inOutlineMode || subIndex === 0)

                return (
                  <MemoizedTreeCard
                    key={`${card.node.id}-${actualCardIndex}`}
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
