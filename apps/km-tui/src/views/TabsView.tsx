/**
 * Tabs View Component
 *
 * Similar to list view but with tab-based navigation between columns.
 * Only shows one column at a time with tabs at the top for switching.
 *
 * Uses silvery ListView for React-level virtualization.
 *
 * NODE MODEL V3: Receives `columnIds: string[]` and self-resolves column +
 * card data reactively via `useNode(id)` + `useSignal(ps.visibleLens)`.
 */
import React, { useMemo } from "react"
import { Box, Text, Small, ListView } from "@silvery/ag-react"
import type { KNode } from "@km/core"
import { getNodeDisplayName, isNodeUntitled } from "../state.ts"
import { deriveColumnExcludedSigils } from "../state/ui-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { parseToPlainText } from "../text/index.ts"
import { MemoizedTreeCard } from "./shared-components.tsx"
import { NodeTabView } from "./NodeView.tsx"
import { useNodeStore } from "../state/reactive.ts"
import { useSignal, usePaneSignals } from "../hooks/use-signal.ts"
import { useApp as useAppStore } from "@silvery/create/create-app"
import { type BoardAppStore } from "../state/board-app-store.ts"

// Virtualization constants
const OVERSCAN = 10
const MAX_RENDERED_ITEMS = 100

interface TabsViewProps {
  /** Column node ids in render order */
  columnIds: readonly string[]
  width: number
  height: number
}

export function TabsView({ columnIds, width, height }: TabsViewProps): React.ReactElement {
  const repo = useRepo()

  // Reactive lens — subscribe once and derive column/card data below
  const ps = usePaneSignals()
  const lens = useSignal(ps.visibleLens)

  const nodeStore = useNodeStore()
  const cursorCardNodeId = useSignal(nodeStore.cursorCardNodeId)
  const cursorColumnNodeId = useSignal(nodeStore.cursorColumnNodeId)
  const cursorDepth = useSignal(nodeStore.cursorDepth)

  // Derive colIndex from cursorColumnNodeId for tab highlighting and column lookup
  const colIndex = useMemo(() => {
    if (!cursorColumnNodeId) return 0
    const idx = columnIds.indexOf(cursorColumnNodeId)
    return idx >= 0 ? idx : 0
  }, [cursorColumnNodeId, columnIds])

  // Track editing state for dynamic item height (border adds 2 rows)
  const sel = useAppStore<BoardAppStore, import("@silvery/selection").SelectionStore>((s) => s.sel)
  const textEdit = useSignal(sel.text)
  const editingNodeId = (textEdit?.nodeId as string) ?? null

  // Resolve current column (node + card nodes) via the lens
  const currentColId = columnIds[colIndex]
  const currentColNode = currentColId ? (lens.get(currentColId) ?? repo.getNode(currentColId)) : null
  const currentCardNodes = useMemo(() => {
    if (!currentColId) return [] as KNode[]
    return lens
      .children(currentColId)
      .map((id) => repo.getNode(id))
      .filter((n): n is KNode => n != null)
  }, [currentColId, lens, repo])
  const count = currentCardNodes.length

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const colName = currentColNode ? parseToPlainText(getNodeDisplayName(repo, currentColNode)) : ""
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(colName, currentColNode?.id, currentColNode?.fs_path),
    [colName, currentColNode?.id, currentColNode?.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Column header is selected when at column level
  const isColumnHeaderSelected = cursorDepth === "column"

  return (
    <Box flexDirection="column" width={width} maxHeight={height} overflow="hidden">
      {/* Spacer line between top bar and tabs */}
      <Box height={1} flexShrink={0} />

      {/* Tab bar - horizontal tabs with content-based widths */}
      {/* Each tab width = max(10, content length) + padding, extra space goes to right */}
      <Box flexDirection="row" width={width} height={1} flexShrink={0}>
        {columnIds.map((id, cIdx) => {
          const tabNode = lens.get(id) ?? repo.getNode(id)
          if (!tabNode) return null
          const isActive = cIdx === colIndex
          const tabName = getNodeDisplayName(repo, tabNode)
          const untitled = isNodeUntitled(repo, tabNode)
          const tabChildIds = lens.children(id)
          const colCount = tabChildIds.length
          const showActiveHighlight = isActive && cursorDepth !== "board"
          const isTabSelected = isActive && isColumnHeaderSelected

          return (
            <React.Fragment key={`${id}-${cIdx}`}>
              <Box
                id={id}
                {...(isTabSelected && {
                  "data-cursor": true,
                  "data-col-index": cIdx,
                  "data-card-index": -1,
                })}
              >
                <NodeTabView
                  node={tabNode}
                  displayName={tabName}
                  isActive={showActiveHighlight}
                  isSelected={isTabSelected}
                  untitled={untitled}
                  count={colCount}
                  dimInactive={cursorDepth === "board"}
                />
              </Box>
              {/* Separator with space padding */}
              {cIdx < columnIds.length - 1 && <Text dimColor> │ </Text>}
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

      {/* Content area with virtualized rendering — explicit height avoids
          flexGrow + parent overflow="hidden" layout bug where the child only
          gets minHeight instead of remaining space */}
      <Box flexDirection="column" width={width} height={height - 3}>
        {currentColNode ? (
          count > 0 ? (
            <ListView
              items={currentCardNodes}
              height={height - 3}
              estimateHeight={(index: number) => (currentCardNodes[index]?.id === editingNodeId ? 3 : 1)}
              scrollTo={cursorCardNodeId ? currentCardNodes.findIndex((c) => c.id === cursorCardNodeId) : undefined}
              overscan={OVERSCAN}
              maxRendered={MAX_RENDERED_ITEMS}
              getKey={(card) => card.id}
              renderItem={(card: KNode, actualCardIndex: number) => {
                const isCardSelected = cursorDepth === "card" && card.id === cursorCardNodeId

                return (
                  <MemoizedTreeCard
                    key={`${card.id}-${actualCardIndex}`}
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
              <Small>(empty)</Small>
            </Box>
          )
        ) : (
          <Small>No column selected</Small>
        )}
      </Box>
    </Box>
  )
}
