/**
 * Columns View Component
 *
 * Tree/outline view within each column - combines the columnar structure
 * with hierarchical display of cards and their children.
 *
 * Uses silvery HorizontalVirtualList for horizontal column windowing and
 * ListView for React-level virtualization of large card lists.
 *
 * NODE MODEL V3: ColumnTree receives `colId: string` and self-resolves its
 * node + card list reactively via `useNode(id)` + `useSignal(ps.visibleLens)`.
 */
import React, { useCallback, useMemo } from "react"
import { useRepo } from "../repo-context.tsx"
import { Box, Small, HorizontalVirtualList } from "@silvery/ag-react"
import { createLogger } from "loggily"

const log = createLogger("km:tui:columns")
import type { KNode } from "@km/core"
import { useTreeRenderContext, deriveColumnExcludedSigils } from "../state/ui-context.tsx"
import { useApp as useAppStore } from "@silvery/create/create-app"
import { type BoardAppStore } from "../state/board-app-store.ts"
import { ColumnHeader, deriveColumnHeaderProps } from "./NodeView.tsx"
import { VerticalScrollIndicator } from "./VerticalScrollIndicator.tsx"
import { MemoizedTreeCard } from "./shared-components.tsx"
import { useNodeStore, useTreeNode } from "../state/reactive.ts"
import { useSignal, usePaneSignals } from "../hooks/use-signal.ts"
import { ScrollTrackingVirtualList } from "./ScrollTracker.tsx"
import { extractWipLimits } from "@km/board"

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
  /** Column node id — self-resolves data via useNode + lens */
  colId: string
  colIndex: number
  width: number
  height: number
}

/**
 * Memoized ColumnTree - does NOT re-render on j/k within the same column.
 *
 * Column subscribes only to column selection state (stable on j/k).
 * ScrollTrackingVirtualList handles cardIndex subscription via ListView.
 * Cards use NodeStore self-subscription for selection state.
 */
const ColumnTree = React.memo(function ColumnTree({ colId, colIndex, width, height }: ColumnTreeProps) {
  const repo = useRepo()
  const {
    treeConfig: { iconStyle },
  } = useTreeRenderContext()

  // Reactive lens — ensures re-derivation on tree changes
  const ps = usePaneSignals()
  const lens = useSignal(ps.visibleLens)
  const colNode = lens.get(colId) ?? repo.getNode(colId)

  // Card list + WIP limit derived from the lens
  const cardIds = lens.children(colId)
  const cardNodes = useMemo(
    () => cardIds.map((id) => repo.getNode(id)).filter((n): n is KNode => n != null),
    [cardIds, repo],
  )
  const rules = lens.rules(colId)
  const wipLimit = useMemo(() => {
    if (rules?.limit !== undefined) return rules.limit
    if (!colNode) return undefined
    const rootId = lens.rootId
    if (!rootId) return undefined
    const structural: KNode[] = []
    for (const siblingId of lens.children(rootId)) {
      if (lens.role(siblingId) !== "body-column") {
        const n = lens.get(siblingId)
        if (n) structural.push(n)
      }
    }
    const limits = extractWipLimits(structural)
    const normalizedName = (colNode.name || colNode.title || "").toLowerCase().replace(/\s+/g, "_")
    return limits.get(normalizedName)
  }, [rules, colNode, lens, colId])

  // Per-node reactive selection — reads tree signals instead of global
  // cursorColumnNodeId/cursorDepth. Re-renders only when this column's state changes.
  const colTreeNode = useTreeNode(colId)
  const colCursorOnThis = useSignal(colTreeNode.cursor)
  const colCursorInDesc = useSignal(colTreeNode.cursorDescendant) as boolean
  const isSelected = colCursorOnThis || colCursorInDesc

  // Track editing state for dynamic item height (border adds 2 rows)
  const sel = useAppStore<BoardAppStore, import("@silvery/selection").SelectionStore>((s) => s.sel)
  const textEdit = useSignal(sel.text)
  const editingNodeId = (textEdit?.nodeId as string) ?? null

  const count = cardNodes.length

  // Column header is selected when cursor is directly on this column node.
  const isColumnHeaderSelected = colCursorOnThis

  // Fallback header node when lens/repo lookup fails
  const headerNode: KNode = colNode ?? ({ id: colId, type: "h", content: "" } as unknown as KNode)

  // Derive column header presentation props (icon, colors, style)
  const { displayName, untitled, ownColor, headerStyle, icon } = deriveColumnHeaderProps(repo, headerNode, {
    iconStyle,
    isSelected,
    isColumnSelected: isColumnHeaderSelected,
  })

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(displayName, colId, colNode?.fs_path),
    [displayName, colId, colNode?.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Stable renderCard callback — doesn't depend on cardIndex.
  // MemoizedTreeCard gets selection state from NodeStore self-subscription.
  const renderCard = useCallback(
    (card: KNode, actualIndex: number) => {
      log.debug?.(`rendering card col=${colIndex} idx=${actualIndex} id=${card.id}`)
      return (
        <Box key={`${card.id}-${actualIndex}`} paddingLeft={1}>
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
      id={colId}
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
      {/* Column header — unified NodeView component */}
      <ColumnHeader
        node={headerNode}
        displayName={displayName}
        untitled={untitled}
        ownColor={ownColor}
        headerStyle={headerStyle}
        icon={icon}
        cardCount={count}
        width={width}
        isColumnSelected={isColumnHeaderSelected}
        isSelected={isSelected}
        wipLimit={wipLimit}
        showSeparator
      />

      {/* Cards with ScrollTrackingVirtualList */}
      {cardNodes.length > 0 ? (
        <ScrollTrackingVirtualList
          isSelected={isSelected}
          items={cardNodes}
          height={height - 2}
          estimateHeight={(index: number) => (cardNodes[index]?.id === editingNodeId ? 3 : 1)}
          overscan={OVERSCAN}
          maxRendered={MAX_RENDERED_ITEMS}
          getKey={(card) => card.id}
          renderItem={renderCard}
          overflowIndicator
        />
      ) : (
        <Box flexDirection="column" flexGrow={1} minHeight={1}>
          <Small>(empty)</Small>
        </Box>
      )}
    </Box>
  )
})

// =============================================================================
// ColumnsView Component
// =============================================================================

interface ColumnsViewProps {
  /** Column node ids in render order */
  columnIds: readonly string[]
  width: number
  height: number
}

// Maximum column width for columns view (tighter than cards view)
const COLUMNS_VIEW_MAX_WIDTH = 50

export function ColumnsView({ columnIds, width, height }: ColumnsViewProps): React.ReactElement {
  const nodeStore = useNodeStore()
  const cursorColumnNodeId = useSignal(nodeStore.cursorColumnNodeId)
  const colIndex = useMemo(() => {
    if (!cursorColumnNodeId) return 0
    const idx = columnIds.indexOf(cursorColumnNodeId)
    return idx >= 0 ? idx : 0
  }, [cursorColumnNodeId, columnIds])

  // Convert readonly tuple for HorizontalVirtualList (expects mutable array)
  const columnIdsArr = useMemo(() => [...columnIds], [columnIds])

  // Column width — uniform width capped at COLUMNS_VIEW_MAX_WIDTH.
  // HVL internally reserves space for overflow indicators (overflowIndicatorWidth * 2 = 2).
  // Subtract the same amount here so column widths fit the effective viewport.
  const indicatorReserved = 2
  const usableWidth = width - indicatorReserved
  const maxCols = Math.max(1, Math.floor(usableWidth / 35))
  const effectiveColCount = Math.min(columnIds.length, maxCols)
  const expandedWidth = Math.min(COLUMNS_VIEW_MAX_WIDTH, Math.max(20, Math.floor(usableWidth / effectiveColCount)))
  const columnHeight = height - 1

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Blank line between top bar and column headers */}
      <Box height={1} flexShrink={0} />

      {/* Columns row — HVL handles horizontal windowing and scroll indicators */}
      {columnIds.length === 0 ? (
        <Box flexDirection="row" flexGrow={1}>
          <Small>Empty board</Small>
        </Box>
      ) : (
        <HorizontalVirtualList
          items={columnIdsArr}
          width={width}
          height={columnHeight}
          itemWidth={expandedWidth}
          scrollTo={colIndex}
          renderItem={(id, index) => (
            <ColumnTree colId={id} colIndex={index} width={expandedWidth} height={columnHeight} />
          )}
          renderOverflowIndicator={(dir, hiddenCount) => (
            <VerticalScrollIndicator direction={dir === "before" ? "left" : "right"} hiddenCount={hiddenCount} />
          )}
          overflowIndicatorWidth={1}
          getKey={(id) => id}
        />
      )}
    </Box>
  )
}
