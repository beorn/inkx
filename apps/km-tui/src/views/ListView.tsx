/**
 * List View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 *
 * Uses silvery ListView for React-level virtualization of large lists.
 *
 * Performance optimization: Pre-caches board pills for all visible nodes
 * to avoid O(n) database queries during render.
 *
 * NODE MODEL V3: Receives `columnIds: string[]` and self-resolves all
 * column + card data reactively via `useSignal(ps.visibleLens)`.
 */
import React, { useMemo, useCallback } from "react"
import { Box, Text, Small, ListView as SilveryListView } from "@silvery/ag-react"
import type { KNode } from "@km/core"
import { getBoardPills, type BoardPill } from "../board/board-pills.ts"
import { useTreeRenderContext, deriveColumnExcludedSigils } from "../state/ui-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { parseToPlainText } from "../text/index.ts"
import { useRepo } from "../repo-context.tsx"
import { MemoizedTreeCard, MemoizedColumnHeader } from "./shared-components.tsx"
import { useNodeStore } from "../state/reactive.ts"
import { useSignal, usePaneSignals } from "../hooks/use-signal.ts"
import { useApp as useAppStore } from "@silvery/create"
import { type BoardAppStore } from "../state/board-app-store.ts"

// Virtualization constants
const OVERSCAN = 10
const MAX_RENDERED_ITEMS = 100

// Type for flattened list items
type FlatItem =
  | {
      type: "header"
      colIndex: number
      cardIndex: -1
      colId: string
      card?: undefined
    }
  | {
      type: "card"
      colIndex: number
      cardIndex: number
      colId: string
      card: KNode
    }

// Empty children array constant - stable reference for memoization
const EMPTY_CHILDREN: KNode[] = []

interface ListViewProps {
  /** Column node ids in render order */
  columnIds: readonly string[]
  width: number
  height: number
}

export function ListView({ columnIds, width, height }: ListViewProps): React.ReactElement {
  const { rootBoardId } = useTreeRenderContext()
  const repo = useRepo()

  // Reactive lens — subscribe once and derive column/card data below
  const ps = usePaneSignals()
  const lens = useSignal(ps.visibleLens)

  const nodeStore = useNodeStore()
  const cursorCardNodeId = useSignal(nodeStore.cursorCardNodeId)
  const cursorColumnNodeId = useSignal(nodeStore.cursorColumnNodeId)
  const cursorDepth = useSignal(nodeStore.cursorDepth)

  // Track editing state for dynamic item height (border adds 2 rows)
  const sel = useAppStore<BoardAppStore, import("@silvery/selection").SelectionStore>((s) => s.sel)
  const textEdit = useSignal(sel.text)
  const editingNodeId = (textEdit?.nodeId as string) ?? null

  // Flatten all cards into a single list
  const flatItems = useMemo(() => {
    const items: FlatItem[] = []

    columnIds.forEach((colId, cIdx) => {
      items.push({ type: "header", colIndex: cIdx, cardIndex: -1, colId })
      const cardIds = lens.children(colId)
      cardIds.forEach((cardId, idx) => {
        const card = repo.getNode(cardId)
        if (!card) return
        items.push({ type: "card", colIndex: cIdx, cardIndex: idx, colId, card })
      })
    })

    return items
  }, [columnIds, lens, repo])

  // Pre-cache column-level excluded sigils per column index
  const columnExcludedSigilsByCol = useMemo(() => {
    const map = new Map<number, string[] | undefined>()
    columnIds.forEach((colId, cIdx) => {
      const colNode = lens.get(colId) ?? repo.getNode(colId)
      if (!colNode) return
      const name = parseToPlainText(getNodeDisplayName(repo, colNode))
      const sigils = deriveColumnExcludedSigils(name, colId, colNode.fs_path)
      map.set(cIdx, sigils.length > 0 ? sigils : undefined)
    })
    return map
  }, [columnIds, lens, repo])

  // Pre-cache board pills for ALL cards to avoid O(n) DB queries during render
  // This batches the lookups into a single pass through all cards
  const boardPillsCache = useMemo(() => {
    const cache = new Map<string, BoardPill[]>()
    const excludeBoardIds = rootBoardId ? new Set([rootBoardId]) : new Set<string>()

    for (const item of flatItems) {
      if (item.type === "card" && item.card.item?.task?.status != null) {
        cache.set(item.card.id, getBoardPills(repo, item.card, excludeBoardIds))
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

  // Calculate the selected item's index in flat list using node IDs
  const selectedFlatIndex = useMemo(() => {
    if (!cursorColumnNodeId) return 0
    for (let i = 0; i < flatItems.length; i++) {
      const item = flatItems[i]
      if (!item) continue
      if (cursorDepth === "column" && item.type === "header" && item.colId === cursorColumnNodeId) {
        return i
      }
      if (cursorDepth === "card" && item.type === "card" && item.card.id === cursorCardNodeId) {
        return i
      }
    }
    return 0
  }, [cursorColumnNodeId, cursorCardNodeId, cursorDepth, flatItems])

  // Render item callback for ListView
  const renderItem = useCallback(
    (item: FlatItem, flatIndex: number) => {
      if (item.type === "header") {
        const cIdx = item.colIndex
        const colNodeId = item.colId

        return (
          <Box key={`header-${colNodeId}-${flatIndex}`} position="sticky" stickyTop={0}>
            <MemoizedColumnHeader colId={colNodeId} colIdx={cIdx} width={width} showTopSpacer={cIdx > 0} />
          </Box>
        )
      }

      // Card item — MemoizedTreeCard self-subscribes to tree node signals
      const cIdx = item.colIndex
      const cardIdx = item.cardIndex
      const cardNodeId = item.card.id

      return (
        <MemoizedTreeCard
          key={`${cardNodeId}-${flatIndex}`}
          card={item.card}
          colIndex={cIdx}
          cardIndex={cardIdx}
          children={EMPTY_CHILDREN}
          getBoardPills={getCachedBoardPills}
          extraExcludedSigils={columnExcludedSigilsByCol.get(cIdx)}
        />
      )
    },
    [width, getCachedBoardPills, columnExcludedSigilsByCol],
  )

  // Empty state
  if (columnIds.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text> </Text>
        <Small>Empty board</Small>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={width} maxHeight={height} overflow="hidden">
      {/* Blank line at top */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>

      {/* Virtualized list using silvery ListView */}
      <SilveryListView
        items={flatItems}
        height={height - 1}
        estimateHeight={(index: number) => {
          const item = flatItems[index]
          return item?.type === "card" && item.card.id === editingNodeId ? 3 : 1
        }}
        scrollTo={selectedFlatIndex}
        overscan={OVERSCAN}
        maxRendered={MAX_RENDERED_ITEMS}
        getKey={(item) => (item.type === "header" ? `header-${item.colId}` : item.card.id)}
        renderItem={renderItem}
        width={width}
      />
    </Box>
  )
}
