/**
 * List View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 *
 * Uses inkx VirtualList for React-level virtualization of large lists.
 *
 * Performance optimization: Pre-caches board pills for all visible nodes
 * to avoid O(n) database queries during render.
 */
import React, { useMemo, useCallback } from "react"
import { Box, Text, VirtualList } from "inkx"
import type { TUIBoardState, CardState } from "../types.ts"
import { getBoardPills, type BoardPill } from "../board-pills.ts"
import { useTreeRenderContext, deriveColumnExcludedSigils } from "../ui-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { renderPlain } from "../text/index.ts"
import { useRepo } from "../repo-context.tsx"
import type { KNode } from "@km/core"
import { MemoizedTreeCard, MemoizedColumnHeader } from "./shared-components.tsx"
import { useCursorPosition } from "../cursor-context.tsx"
import { useUISelector } from "../ui-context.tsx"

// Virtualization constants
const OVERSCAN = 10
const MAX_RENDERED_ITEMS = 100

// Type for flattened list items
type FlatItem =
  | {
      type: "header"
      colIdx: number
      cardIdx: -1
      column: TUIBoardState["columns"][0]
      card?: undefined
    }
  | {
      type: "card"
      colIdx: number
      cardIdx: number
      column: TUIBoardState["columns"][0]
      card: CardState
    }

// Empty children array constant - stable reference for memoization
const EMPTY_CHILDREN: KNode[] = []

interface ListViewProps {
  state: TUIBoardState
  width: number
  height: number
  colIndex: number
  cardIndex: number
  subIndex: number
  selectionLevel: "board" | "column" | "card"
}

export function ListView({
  state,
  width,
  height,
  colIndex: _colIndexProp,
  cardIndex: _cardIndexProp,
  subIndex: subIndexProp,
  selectionLevel: _selectionLevelProp,
}: ListViewProps): React.ReactElement {
  const { treeConfig, rootBoardId } = useTreeRenderContext()
  const { inOutlineMode } = treeConfig
  const repo = useRepo()

  // Use CursorStore for cursor position (self-subscription, bypasses Board re-render)
  const cursorPos = useCursorPosition()
  const colIndex = cursorPos.colIndex
  const cardIndex = cursorPos.cardIndex
  const selectionLevel = cursorPos.selectionLevel
  const subIndex = subIndexProp

  // Track editing state for dynamic item height (border adds 2 rows)
  const editingNodeId = useUISelector((s) => s.inlineEditBlock?.nodeId ?? null)

  // Flatten all cards into a single list
  const flatItems = useMemo(() => {
    const items: FlatItem[] = []

    state.columns.forEach((column, cIdx) => {
      items.push({ type: "header", colIdx: cIdx, cardIdx: -1, column })
      column.cards.forEach((card, idx) => {
        items.push({ type: "card", colIdx: cIdx, cardIdx: idx, column, card })
      })
    })

    return items
  }, [state.columns])

  // Pre-cache column-level excluded sigils per column index
  const columnExcludedSigilsByCol = useMemo(() => {
    const map = new Map<number, string[] | undefined>()
    state.columns.forEach((col, cIdx) => {
      const name = renderPlain(getNodeDisplayName(repo, col.node))
      const sigils = deriveColumnExcludedSigils(name, col.node.id, col.node.fs_path)
      map.set(cIdx, sigils.length > 0 ? sigils : undefined)
    })
    return map
  }, [state.columns, repo])

  // Pre-cache board pills for ALL cards to avoid O(n) DB queries during render
  // This batches the lookups into a single pass through all cards
  const boardPillsCache = useMemo(() => {
    const cache = new Map<string, BoardPill[]>()
    const excludeBoardIds = rootBoardId ? new Set([rootBoardId]) : new Set<string>()

    for (const item of flatItems) {
      if (item.type === "card" && item.card.node.task_status != null) {
        cache.set(item.card.node.id, getBoardPills(repo, item.card.node, excludeBoardIds))
      }
    }
    return cache
  }, [flatItems, rootBoardId, repo])

  // Cached getBoardPills function to pass to TreeNode
  // Use useCallback to maintain stable reference when cache content is same
  const getCachedBoardPills = useCallback(
    (node: KNode, _excludeBoardIds: Set<string>): BoardPill[] => {
      return boardPillsCache.get(node.id) ?? []
    },
    [boardPillsCache],
  )

  // Calculate the selected item's index in flat list
  const selectedFlatIndex = useMemo(() => {
    let idx = 0
    for (let c = 0; c < colIndex; c++) {
      idx += 1 + (state.columns[c]?.cards.length ?? 0)
    }
    return selectionLevel === "column" ? idx : idx + 1 + cardIndex
  }, [colIndex, cardIndex, selectionLevel, state.columns])

  // Render item callback for VirtualList
  const renderItem = useCallback(
    (item: FlatItem, flatIndex: number) => {
      if (item.type === "header") {
        const cIdx = item.colIdx
        const isColSelected = selectionLevel === "column" && colIndex === cIdx
        const isSelected = colIndex === cIdx

        return (
          <Box key={`header-${item.column.node.id}-${flatIndex}`} position="sticky" stickyTop={0}>
            <MemoizedColumnHeader
              column={item.column}
              colIdx={cIdx}
              isSelected={isSelected}
              isColSelected={isColSelected}
              width={width}
              showTopSpacer={cIdx > 0}
            />
          </Box>
        )
      }

      // Card item
      const cIdx = item.colIdx
      const cardIdx = item.cardIdx
      const isCardSelected =
        selectionLevel === "card" && colIndex === cIdx && cardIndex === cardIdx && (!inOutlineMode || subIndex === 0)

      return (
        <MemoizedTreeCard
          key={`${item.card.node.id}-${flatIndex}`}
          card={item.card}
          colIndex={cIdx}
          cardIndex={cardIdx}
          isSelected={isCardSelected}
          children={EMPTY_CHILDREN}
          getBoardPills={getCachedBoardPills}
          extraExcludedSigils={columnExcludedSigilsByCol.get(cIdx)}
        />
      )
    },
    [
      colIndex,
      cardIndex,
      subIndex,
      selectionLevel,
      inOutlineMode,
      width,
      getCachedBoardPills,
      columnExcludedSigilsByCol,
    ],
  )

  // Empty state
  if (state.columns.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text> </Text>
        <Text dimColor>Empty board</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={width} maxHeight={height} overflow="hidden">
      {/* Blank line at top */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>

      {/* Virtualized list using inkx VirtualList */}
      <VirtualList
        items={flatItems}
        height={height - 1}
        itemHeight={(item: FlatItem) => (item.type === "card" && item.card.node.id === editingNodeId ? 3 : 1)}
        scrollTo={selectedFlatIndex}
        overscan={OVERSCAN}
        maxRendered={MAX_RENDERED_ITEMS}
        keyExtractor={(item) => (item.type === "header" ? `header-${item.column.node.id}` : item.card.node.id)}
        renderItem={renderItem}
        width={width}
      />
    </Box>
  )
}
