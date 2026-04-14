/**
 * Card and Column components for the Board view
 *
 * Uses silvery ListView for React-level virtualization of large card lists.
 *
 * NODE MODEL V3: Column receives `colId: string` and self-resolves node data
 * reactively via `useNode(id)` + `useSignal(ps.visibleLens)`. "column" is a
 * parent KNode identified by id, "card" is a KNode. Embed data and body status
 * are derived from ViewTree signals (useNode/useViewTree).
 */
import React, { useCallback, useEffect, useMemo } from "react"
import { useApp as useAppStore } from "@silvery/create"
import { useRepo } from "../repo-context.tsx"
import { layoutLog, sid } from "../log.ts"
import { useComponentTiming } from "../hooks/use-component-timing.ts"
import { Box, Text, Small, useScrollRect } from "@silvery/ag-react"
import { useJobRunner, useUndoHandle } from "../services-context.tsx"
import { isDetailViewPane } from "../board/board-types.ts"
import { type KNode, getStatusForMarker } from "@km/core"
import { extractWipLimits } from "@km/board"
import { Workspace, type BoardAppStore } from "../state/board-app-store.ts"
import { getNodeDisplayName, isNodeUntitled } from "../state.ts"
import { TreeNode } from "./TreeNode.tsx"
import { parseToPlainText, InlineText } from "../text/index.ts"
import { displayLength } from "../text/rich.ts"
import { ColumnHeader, deriveColumnHeaderProps } from "./NodeView.tsx"
import { composeRawEditContent } from "./tree-node-edit.tsx"
import { useNavigator } from "../layout-context.tsx"
import { usePaneId } from "../pane-context.tsx"
import {
  useUISelector,
  useSetUI,
  useSel,
  deriveColumnExcludedSigils,
  useTreeRenderContext,
} from "../state/ui-context.tsx"
import { InlineEditField } from "./InlineEditField.tsx"
import { useRepoEffect } from "../hooks/use-repo-effect.ts"
import { useNodeStore, useTreeNode } from "../state/reactive.ts"
import { useSignal, useNode, useViewTree, usePaneSignals } from "../hooks/use-signal.ts"
import { useStore } from "../state/store-context.tsx"
import { useChildIdsSignal } from "../hooks/use-signal.ts"
import { ResourceState } from "@km/storage"
import { ScrollTrackingVirtualList } from "./ScrollTracker.tsx"
import { isHRContent, MAX_EXPANDED_CHILDREN } from "./tree-node-helpers.tsx"
import { isCollapsedChild, CARD_REMAINING_DEPTH } from "@km/board"
import { useCardInteraction } from "../hooks/use-card-interaction.tsx"
import { useTheme } from "@silvery/ag-react"
import { selectedBg, multiSelectedBg } from "../theme.ts"

// =============================================================================
// Virtualization Constants
// =============================================================================

/**
 * Estimated card height in rows (border + content + padding).
 * Used as fallback before actual heights are measured. After the first render,
 * ListView measures real card heights and uses those for scroll math.
 * This estimate only matters for the initial render — a reasonable value
 * (4 rows = border + title + 1 child) prevents noticeable jumpiness.
 */
const ESTIMATED_CARD_HEIGHT = 4

/**
 * Number of extra cards to render above and below visible area.
 * Provides buffer for smooth scrolling and covers the gap between
 * estimated and actual heights during the measurement stabilization pass.
 */
const OVERSCAN = 5

/**
 * Maximum number of cards to render at once.
 * Cards are expensive (~15 hooks each), so keep this tight. ListView will
 * always window the list — no bypass for small columns.
 */
// No MAX_RENDERED_CARDS — the virtualizer computes the render window from
// itemHeight + viewport height + overscan. A fixed cap causes empty space
// on tall terminals when cards are short.

// =============================================================================
// Card Component
// =============================================================================

interface CardProps {
  card: KNode
  width: number
  colIndex: number
  cardIndex: number
  /** True if this card is in a body column (renders borderless) */
  isBodyColumn?: boolean
  /** True if the previous card is also a body block (for yield logic) */
  isPrevBodyBlock?: boolean
  /** True if this is the last body block before a structural card or end of column */
  isLastBodyBlock?: boolean
  /** Additional sigils to exclude from card content (e.g., column-level sigils) */
  extraExcludedSigils?: string[]
  /** True if the parent column is at column-level selection (cursor on column header) */
  isColumnSelected?: boolean
  /** NodeId of the previous card (for body block yield-top logic) */
  prevCardNodeId?: string
  /** Whether this card is a body block (before first outline item) */
  isBodyCard?: boolean
  /** Number of children (pre-computed to avoid DB lookup when folded) */
  childCount?: number
}

/**
 * Memoized Card - skips re-render when props are unchanged.
 *
 * Key optimization: cursor movement only changes isSelected for 2 cards
 * (old selection and new selection). All other cards should skip re-render.
 *
 * Layout registration: Uses useScrollRect to register screen positions
 * without causing re-renders. This enables h/l visual navigation across
 * columns with different scroll positions.
 */
/**
 * Helper component that registers the Card's screen position.
 * Must be rendered INSIDE the Card's Box to get the correct node context.
 */
function CardLayoutRegistrar({ colIndex, cardIndex }: { colIndex: number; cardIndex: number; nodeId: string }): null {
  const registry = useNavigator()
  const paneId = usePaneId()

  // Detail panes use flat sequential navigation (createDetailViewNavigation)
  // that doesn't use the grid navigator. Without this guard, the detail pane's
  // section 0 overwrites the parent board pane's section 0 (both use colIndex
  // starting from 0), corrupting stickyY-based h/l navigation in the board.
  const isDetailPane = useAppStore<BoardAppStore, boolean>((s) => {
    const pane = s.workspace.panes.get(paneId)
    return !!pane && isDetailViewPane(pane)
  })

  const handleLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry || isDetailPane) {
        layoutLog.trace?.(
          `CardLayoutRegistrar: skip col=${colIndex} card=${cardIndex} (${isDetailPane ? "detail pane" : "no registry"})`,
        )
        return
      }

      layoutLog.trace?.(`CardLayoutRegistrar: col=${colIndex} card=${cardIndex} y=${computed.y} h=${computed.height}`)
      registry.register(colIndex, cardIndex, {
        x: computed.x,
        y: computed.y,
        width: computed.width,
        height: computed.height,
      })
    },
    [registry, colIndex, cardIndex, isDetailPane],
  )

  useScrollRect(handleLayout)

  // Clean up registry entry when ListView unmounts this card.
  // Without this, stale entries with old screen positions remain in the
  // registry after scrolling, causing findItemAtY to return the wrong
  // card during h/l navigation (stickyY intersects stale bounding box).
  useEffect(() => {
    return () => {
      if (!isDetailPane) registry?.unregister(colIndex, cardIndex)
    }
  }, [registry, colIndex, cardIndex, isDetailPane])

  return null
}

/**
 * Populates a ref with the card's screen-space bounding box for popover
 * overlap positioning. Rendered inside the card's Box to get the correct
 * NodeContext. Uses useScrollRect (zero re-renders).
 */
function PopoverRectRegistrar({
  rectRef,
}: {
  rectRef: React.MutableRefObject<{ x: number; y: number; width: number; height: number } | null>
}): null {
  useScrollRect((rect) => {
    rectRef.current = rect
  })
  return null
}

const Card = React.memo(
  function Card({
    card,
    width,
    colIndex,
    cardIndex,
    isBodyColumn,
    isPrevBodyBlock,
    isLastBodyBlock,
    extraExcludedSigils,
    isColumnSelected: isColSelected = false,
    prevCardNodeId,
    isBodyCard: isBodyCardProp = false,
    childCount: childCountProp,
  }: CardProps): React.ReactElement {
    const nodeId = card.id
    // Derive isBody from ViewTree signal when available, fallback to prop
    const viewNode = useNode(nodeId)
    const isBodyCard = viewNode?.isBody ?? isBodyCardProp

    // Per-node reactive selection state — reads tree signals instead of global
    // cursor/depth. Only the old + new cursor cards re-render on j/k.
    const nodeStore = useNodeStore()
    const treeNode = useTreeNode(nodeId)
    const isCursorOnThis = useSignal(treeNode.cursor)
    const cursorInDescendant = useSignal(treeNode.cursorDescendant) as boolean
    const isSelected = isCursorOnThis || cursorInDescendant

    // Hover + click interaction (border highlight, click-to-select, Cmd+click-to-navigate)
    const {
      hoverBorderColor,
      cardRectRef,
      handlers: hoverHandlers,
    } = useCardInteraction(nodeId, isSelected || isColSelected)

    // Check if the card ABOVE is at cursor position. Used by body blocks:
    // yield paddingTop only when prev is a BODY block at cursor (not structural).
    // Reads prev card's tree node signals — avoids global cursorCardNodeId read.
    const prevTreeNode = useTreeNode(prevCardNodeId ?? nodeId) // fallback to self when no prev
    const prevCursor = useSignal(prevTreeNode.cursor)
    const prevCursorDesc = useSignal(prevTreeNode.cursorDescendant) as boolean
    const isPrevAtCursor = prevCardNodeId != null && (prevCursor || prevCursorDesc)

    // Check if this card is in inline edit mode (for border color).
    // Also matches when a sub-item of this card is being edited (editingDescendant).
    const editingDescendant = useSignal(treeNode.editingDescendant) as boolean
    const isDirectlyEditing = useAppStore<BoardAppStore, boolean>((s) => {
      return s.sel.text()?.nodeId === nodeId
    })
    const isEditing = isDirectlyEditing || editingDescendant

    // Check if this card is part of a multi-selection (Shift+J/K or Shift+H/L).
    // Uses reactive signal (not raw Set) so descendants of selected parents also highlight.
    const isNodeSelected = useSignal(treeNode.selected)

    // Compute overflow: check if any children are hidden by maxContentLines.
    // Mirrors TreeNode's logic: check root's direct children AND grandchildren.
    // Also accounts for title wrap lines (long titles that wrap to 2 lines).
    const repo = useRepo()
    // Per-card child ID signal — re-derive children only when THIS card's children change,
    // not on every repo mutation. Uses useChildIdsSignal for per-card granularity.
    const store = useStore()
    const childIdsState = useChildIdsSignal(store, card.id)
    const childIds = ResourceState.isLoaded(childIdsState) ? childIdsState.value : []
    const { treeConfig, taskStatusFilter } = useTreeRenderContext()
    const maxChildren = treeConfig.maxContentLines
    const rawChildren = useMemo(() => repo.getChildren(card.id), [repo, card.id, childIds])
    // Filter out collapsed children AND task-status-filtered children.
    // Must match TreeNode's filtering so overflow count reflects what's actually rendered.
    const children = useMemo(() => {
      let filtered = rawChildren.filter((c) => !isCollapsedChild(c))
      if (taskStatusFilter.size > 0) {
        filtered = filtered.filter((c) => {
          const status = c.item?.task?.status ?? getStatusForMarker(c.item?.task?.marker)
          return !status || taskStatusFilter.has(status)
        })
      }
      return filtered
    }, [rawChildren, taskStatusFilter])
    // When cursor is inside this card (on a descendant), expand to show all children.
    // Must match TreeNode's shouldExpand logic — only expand when cursor is on a
    // descendant, not when cursor is on the card title itself.
    // cursorInDescendant is already read from treeNode above.
    const isExpanded = cursorInDescendant || isEditing

    const childCount = childCountProp ?? children.length
    // Match TreeNode's "+1 more" elimination: if exactly 1 would be hidden, show it instead.
    const baseMax = isExpanded ? MAX_EXPANDED_CHILDREN : maxChildren
    const effectiveMax = childCount === baseMax + 1 ? baseMax + 1 : baseMax
    const directHidden = Math.max(0, childCount - effectiveMax)
    const { hasOverflow, hiddenCount } = useMemo(() => {
      let total = directHidden
      const visibleChildren = children.slice(0, effectiveMax)
      for (const child of visibleChildren) {
        const grandchildren = repo.getChildren(child.id)
        if (grandchildren.length > effectiveMax) {
          total += grandchildren.length - effectiveMax
        }
      }
      // Title wrap: TreeNode constrainText() allows titles up to 2 lines.
      // When the title wraps, it consumes an extra visual line in the card.
      // Include extra title lines in the overflow count.
      const titleText = getNodeDisplayName(repo, card) ?? card.content ?? ""
      const textWidth = Math.max(10, treeConfig.cardInnerWidth - 2) // matches TreeNode prefix width
      const titleDisplayWidth = displayLength(parseToPlainText(titleText))
      const titleExtraLines = Math.min(1, Math.max(0, Math.ceil(titleDisplayWidth / textWidth) - 1))
      total += titleExtraLines
      return { hasOverflow: total > 0, hiddenCount: total }
    }, [directHidden, children, effectiveMax, repo, card, treeConfig.cardInnerWidth])

    // Theme is needed for body-block selection bg (padding-row fill). We
    // read it here (before the HR/body early-returns) so both branches have
    // access. Non-body branches also use useTheme later; React dedupes.
    const theme = useTheme()
    // Body block bg when this block is the cursor or part of a multi-select.
    // Editing suppresses the bg — the focusborder on the card border is the
    // edit indicator, and the bg would compete with it. Column-level cursor
    // is NOT included either: the column container already has a cascaded
    // tint, so duplicating here would double-tint.
    const bodyBlockBg = isEditing
      ? undefined
      : isSelected
        ? selectedBg(theme)
        : isNodeSelected
          ? multiSelectedBg(theme)
          : undefined

    // HR nodes render as borderless centered content (unless being edited,
    // in which case they fall through to normal bordered card with InlineEditField).
    // Detection is content-based: editing "---" to "---f" should stop rendering as HR.
    // Nodes with type="hr" and no content default to "---".
    const hrContent = (card.content ?? (card.type === "hr" ? "---" : "")).trim()
    const isHR = isHRContent(hrContent)

    if (isHR && !isEditing) {
      // HR cards: flat single-row divider, no border/outline, no padding.
      // Selection signaling comes from the column-level tint + the standard
      // cursor inverse on the divider row.
      return (
        <Box
          data-view="card"
          data-card-id={nodeId}
          flexDirection="column"
          flexShrink={0}
          width={width}
          userSelect="none"
          {...hoverHandlers}
        >
          <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
          <PopoverRectRegistrar rectRef={cardRectRef} />
          <Box
            id={nodeId}
            data-view="item"
            justifyContent="center"
            {...(isSelected && {
              "data-cursor": true,
              "data-col-index": colIndex,
              "data-card-index": cardIndex,
            })}
          >
            <Text
              color={isSelected || isNodeSelected ? "$selection-bg" : undefined}
              dimColor={!isSelected && !isNodeSelected}
              wrap="truncate"
            >
              {hrContent}
            </Text>
          </Box>
        </Box>
      )
    }

    if (isBodyColumn || isBodyCard) {
      return (
        <Box
          data-view="card"
          data-card-id={nodeId}
          flexDirection="column"
          flexShrink={0}
          // Full column width so the column's selection tint (when the column
          // owns the cursor) reads as one continuous surface.
          width={width}
          userSelect="none"
          // paddingTop=1 gives a blank line above the content. Because it's
          // padding (inside the Box), when the Box has a backgroundColor the
          // gap row fills with it — creating a continuous highlight across
          // a multi-select or cursor run instead of a striped one. For
          // unselected blocks, backgroundColor is undefined and the padding
          // row inherits the column's bg.
          paddingTop={1}
          backgroundColor={bodyBlockBg}
          {...hoverHandlers}
        >
          <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
          <PopoverRectRegistrar rectRef={cardRectRef} />
          <TreeNode
            node={card}
            depth={0}
            remainingDepth={CARD_REMAINING_DEPTH}
            isSelected={isSelected}
            isBody
            colIndex={colIndex}
            cardIndex={cardIndex}
            dimInactiveChildren={false}
            childCount={childCount}
            extraExcludedSigils={extraExcludedSigils}
            compactContent
            hideChildCount
          />
        </Box>
      )
    }

    // Collapsed card: show title + ··· indicator, no body/children.
    // Uses dotted border to visually distinguish from normal cards.
    const isCardCollapsed = card.rules?.collapse === true
    if (isCardCollapsed) {
      const collapsedTitleText = getNodeDisplayName(repo, card) ?? card.content ?? ""
      const collapsedBorder =
        isSelected || isNodeSelected || isColSelected ? "$selection-bg" : (hoverBorderColor ?? "$muted")
      return (
        <Box
          data-view="card"
          data-card-id={nodeId}
          flexDirection="column"
          flexShrink={0}
          width={width}
          userSelect="none"
          borderStyle="round"
          borderColor={collapsedBorder}
          {...hoverHandlers}
        >
          <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
          <PopoverRectRegistrar rectRef={cardRectRef} />
          <Box
            id={nodeId}
            data-view="item"
            paddingRight={2}
            {...(isSelected && {
              "data-cursor": true,
              "data-col-index": colIndex,
              "data-card-index": cardIndex,
            })}
          >
            <Text dimColor={!isSelected && !isNodeSelected} wrap="truncate">
              <InlineText text={collapsedTitleText} />
              {childCount > 0 ? ` ··· ${childCount}` : " ···"}
            </Text>
          </Box>
        </Box>
      )
    }

    // Direct cursor match: cursor is ON this card (not on a descendant).
    // isCursorOnThis = per-node cursor signal (avoids global cursor read).
    // isSelected = cursor anywhere in this card scope (cursor || cursorDescendant).
    // Multi-selected cards get the stronger multiSelectedBg tint so they stack
    // visually with the rest of the selection (rule 6). Cursor anywhere in card
    // (direct or descendant) gets the subtle selectedBg tint (rule 2).
    // No custom bg during editing — the focusborder on the card border is
    // enough to indicate edit mode. Normal selection tint applies when not editing.
    // Priority: selectedBg for cursor scope (direct or descendant) takes precedence
    // over multiSelectedBg. multiSelectedBg only for multi-selected cards where
    // cursor is elsewhere. This prevents the cursor card from getting the stronger
    // 14% tint when it should get the subtle 6% tint.
    const cardBg = isEditing
      ? undefined
      : isSelected
        ? selectedBg(theme)
        : isNodeSelected
          ? multiSelectedBg(theme)
          : undefined

    // Border: cyan when editing, yellow when card selected, hidden when column selected
    // Done/dropped tasks get a darker border to visually de-emphasize them
    const isDoneOrDropped = card.item?.task?.status === "done" || card.item?.task?.status === "dropped"
    // Default card border: invisible ($surface-bg). Cards are separated by
    // whitespace, not visible borders. Borders appear as interactive feedback:
    // hover → $muted (faint), selection → $selection-bg (yellow).
    // Done/dropped use $disabled-fg for a faint but distinct border.
    const defaultBorder = isDoneOrDropped ? "$disabled-fg" : "$surface-bg"
    // "Board level" means cursor is on an ancestor (column or board root).
    // Read cursorDepth only for the board-level border-hiding check — this is
    // a global concern (rare change), not per-card.
    const selLevel = useSignal(nodeStore.cursorDepth)
    const globalCursor = useSignal(nodeStore.cursor)
    const isBoardLevel = selLevel === "board" && globalCursor !== null
    const borderColor = isEditing
      ? "$focusborder"
      : isColSelected || isBoardLevel
        ? "$surface-bg" // hide borders when column/board selected (same space, invisible)
        : isSelected || isNodeSelected
          ? "$selection-bg"
          : (hoverBorderColor ?? defaultBorder)
    // When overflow, suppress the bottom border and render a custom one with the count
    if (hasOverflow) {
      // Inner width excludes the 2 border columns (left + right)
      const innerWidth = Math.max(0, width - 2)
      const label = ` +${hiddenCount} more `
      const padding = Math.max(0, innerWidth - label.length)
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad

      return (
        <Box
          data-view="card"
          data-card-id={nodeId}
          flexDirection="column"
          flexShrink={0}
          width={width}
          userSelect="none"
          {...hoverHandlers}
        >
          <Box
            flexDirection="column"
            width={width}
            borderStyle={isEditing ? "bold" : "round"}
            borderBottom={false}
            borderColor={borderColor}
            backgroundColor={cardBg}
          >
            <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
            <PopoverRectRegistrar rectRef={cardRectRef} />
            <TreeNode
              node={card}
              depth={0}
              remainingDepth={CARD_REMAINING_DEPTH}
              isSelected={!isEditing && isCursorOnThis}
              colIndex={colIndex}
              cardIndex={cardIndex}
              dimInactiveChildren={false}
              childCount={childCount}
              extraExcludedSigils={extraExcludedSigils}
              hideChildCount
            />
          </Box>
          <Box width={width} height={1} flexShrink={0} backgroundColor={cardBg}>
            <Text wrap="truncate">
              <Text color={borderColor}>╰{"─".repeat(leftPad)}</Text>
              <Text color={borderColor}> +{hiddenCount} more </Text>
              <Text color={borderColor}>{"─".repeat(rightPad)}╯</Text>
            </Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box
        data-view="card"
        data-card-id={nodeId}
        flexDirection="column"
        flexShrink={0}
        width={width}
        userSelect="none"
        borderStyle={isEditing ? "bold" : "round"}
        borderColor={borderColor}
        backgroundColor={cardBg}
        {...hoverHandlers}
      >
        <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
        <PopoverRectRegistrar rectRef={cardRectRef} />
        <TreeNode
          node={card}
          depth={0}
          remainingDepth={CARD_REMAINING_DEPTH}
          isSelected={!isEditing && isCursorOnThis}
          colIndex={colIndex}
          cardIndex={cardIndex}
          dimInactiveChildren={false}
          childCount={childCount}
          extraExcludedSigils={extraExcludedSigils}
          hideChildCount
        />
      </Box>
    )
  },
  (prev, next) => {
    // Reference equality on card — structural sharing in column derivation ensures
    // unchanged cards keep the same object reference across re-derivations.
    // isSelected is driven by NodeStore self-subscription (not props),
    // so it's not compared here — NodeStore triggers re-renders independently.
    return (
      prev.card === next.card &&
      prev.width === next.width &&
      prev.colIndex === next.colIndex &&
      prev.cardIndex === next.cardIndex &&
      prev.isPrevBodyBlock === next.isPrevBodyBlock &&
      prev.isLastBodyBlock === next.isLastBodyBlock &&
      prev.extraExcludedSigils === next.extraExcludedSigils &&
      prev.isColumnSelected === next.isColumnSelected &&
      prev.prevCardNodeId === next.prevCardNodeId
    )
  },
)

// =============================================================================
// Skeleton Cards — shown in empty columns during background parse
// =============================================================================

/**
 * Placeholder cards displayed in a column that has no content yet because
 * background parsing is still in progress (discoverOnly mode).
 * Keeps the board interactive (user can navigate between columns)
 * while giving visual feedback that content is loading.
 */
function SkeletonCards({
  width,
  height,
  colIndex,
}: {
  width: number
  height: number
  colIndex: number
}): React.ReactElement {
  const cardHeight = 3 // border top + content line + border bottom
  const cardCount = Math.max(1, Math.floor(height / cardHeight))

  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      {Array.from({ length: cardCount }, (_, ri) => (
        <Box key={ri} borderStyle="round" dimColor width={width} height={cardHeight}>
          <Text dimColor wrap="truncate">
            {"░".repeat(6 + ((ri * 5 + colIndex * 7) % 12))}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

// =============================================================================
// Column Component
// =============================================================================

interface ColumnProps {
  /** Column node id — the Column self-resolves data via useNode + lens */
  colId: string
  colIndex: number
  isCollapsed: boolean
  width: number
  height: number
  /**
   * Optional filter overlay: when set, only these card IDs are rendered
   * (Board.tsx applies text / property filters beyond the lens).
   * When undefined, the column renders all lens children.
   */
  filteredCardIds?: readonly string[]
  /** Total card count before filter (for the "+N filtered" footer) */
  totalCardCount?: number
  /** Count of descendants hidden by property filters (rendered in footer) */
  hiddenDescendantCount?: number
}

/**
 * Memoized Column - does NOT re-render on j/k within the same column.
 *
 * Column subscribes only to column selection state (stable on j/k).
 * ScrollTrackingVirtualList subscribes to cardIndex and passes scrollTo to ListView.
 * Cards get selection state from NodeStore self-subscription.
 * Result: j/k only re-renders ScrollTrackingVirtualList + ListView + 2 Cards.
 */
// oxlint-disable-next-line complexity/complexity -- React component — JSX ternaries inflate score
export const Column = React.memo(function Column({
  colId,
  colIndex,
  isCollapsed,
  width,
  height,
  filteredCardIds,
  totalCardCount,
  hiddenDescendantCount,
}: ColumnProps): React.ReactElement {
  const repo = useRepo()
  const repoUpdate = useRepoEffect(repo)
  const setUI = useSetUI()
  const sel = useSel()
  const {
    treeConfig: { iconStyle, borderMode: _borderMode, maxContentLines: _maxContentLines },
  } = useTreeRenderContext()
  const jobRunner = useJobRunner()
  const undoHandle = useUndoHandle()
  const nodeId = colId

  // Per-node reactive state: derive column properties from ViewTree
  const colViewNode = useNode(nodeId)

  // Reactive lens — subscribing here ensures re-derivation on any tree change
  const ps = usePaneSignals()
  const lens = useSignal(ps.visibleLens)

  // Fallback node from repo for the rare case where useNode has no data yet.
  const colNodeFromLens = lens.get(nodeId) ?? repo.getNode(nodeId)

  // Per-column mount timing — measure render → commit duration
  useComponentTiming(
    `Column ${colIndex} "${colNodeFromLens?.title ?? colNodeFromLens?.name ?? nodeId}" (${
      (filteredCardIds ?? lens.children(nodeId)).length
    } cards)`,
  )

  // Per-node reactive selection — reads tree signals instead of global
  // cursorColumnNodeId/cursorDepth. Re-renders only when this column's state changes.
  const colTreeNode = useTreeNode(nodeId)
  const colCursorOnThis = useSignal(colTreeNode.cursor)
  const colCursorInDescendant = useSignal(colTreeNode.cursorDescendant) as boolean
  const isSelected = colCursorOnThis || colCursorInDescendant

  // Check if this column header is being inline-edited
  const textEdit = useSignal(sel.text)
  const isInlineEditing = textEdit?.nodeId === nodeId

  // Scroll anchor for mouse wheel viewport scrolling (null = follow cursor)
  const columnScrollAnchor = useAppStore<BoardAppStore, number | null>((s) => {
    const pane = Workspace.getActiveBoardPane(s)
    return pane?.columnScrollAnchor?.colIdx === colIndex ? pane.columnScrollAnchor.anchor : null
  })

  // Check if the board is in a loading state (discoverOnly + background parse).
  // Used to show skeleton cards in empty columns instead of "(empty)".
  // Four conditions trigger loading:
  //   1. isLoading is true (watcher reported "syncing")
  //   2. backgroundParsing is true (deferred-file parsing in progress)
  //   3. watcherStatus is null (initial load, no watcher events received yet)
  //   4. watcherStatus.state is "starting" (watcher is starting up)
  const isLoading = useUISelector(
    (state) =>
      state.isLoading || state.backgroundParsing || !state.watcherStatus || state.watcherStatus.state === "starting",
  )

  // Render name with wiki links stripped: [[target|alias]] → "alias"
  // colNode is the reactive node if available, otherwise the lens fallback.
  const colNode = colViewNode?.data ?? colNodeFromLens ?? null
  const name = colNode ? parseToPlainText(getNodeDisplayName(repo, colNode)) : ""
  const untitled = colNode ? isNodeUntitled(repo, colNode) : false
  // Card count: filtered list when Board applied filters, otherwise lens children.
  const lensCardIds = lens.children(nodeId)
  const effectiveCardIds = filteredCardIds ?? lensCardIds
  const count = effectiveCardIds.length
  const isVirtual = colViewNode ? colViewNode.viewType === "body-column" : lens.role(nodeId) === "body-column"

  // WIP limit: from section rules (km.limit::) or extracted from structural column names.
  const rules = colViewNode?.rules ?? lens.rules(nodeId)
  const wipLimit = useMemo(() => {
    if (rules?.limit !== undefined) return rules.limit
    if (!colNode || isVirtual) return undefined
    // Build structural-column name map at render time (cheap — root.children only)
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
  }, [rules, colNode, isVirtual, lens, nodeId])

  // "+N filtered" footer count: difference between unfiltered total and what's
  // shown, plus any descendants hidden inside surviving cards (e.g., done tasks
  // inside a heading section when the heading itself passes the filter).
  const hiddenCount = (totalCardCount ?? lensCardIds.length) - count + (hiddenDescendantCount ?? 0)

  // Inline edit callbacks — uses renameNode for backlink-safe renames
  const handleInlineEditConfirm = useCallback(
    (newValue: string) => {
      const node = repo.getNode(nodeId)
      const oldName = node?.name ?? ""
      const oldContent = (node?.content ?? "").replace(/^- \[.\]\s*/, "")

      // No-op: value didn't change
      if (newValue === (oldContent || oldName)) {
        sel.text.deselect()
        return
      }

      const nameMatchedContent = !oldName || oldName === oldContent

      if (nameMatchedContent) {
        const impact = repo.getRenameImpact(nodeId)
        const s = impact.backlinks.length === 1 ? "" : "s"

        jobRunner.submit({
          description: `Renaming '${oldName}' → '${newValue}'`,
          impact: impact.backlinks.length > 0 ? `${impact.backlinks.length} backlink${s} will be updated` : "",
          countdownMs: impact.backlinks.length > 0 ? 5000 : 0,
          execute: (onProgress) => {
            undoHandle.setCursor(nodeId)
            undoHandle.startBatch("Rename")
            repo.renameNode(nodeId, newValue, (info) => onProgress(info.updated, info.total))
            undoHandle.endBatch()
          },
        })
      } else {
        // Name and content diverged — just update content, don't rename
        undoHandle.setCursor(nodeId)
        repoUpdate(nodeId, { content: newValue })
      }

      sel.text.deselect()
    },
    [nodeId, repo, setUI, jobRunner, undoHandle],
  )

  const handleInlineEditCancel = useCallback(() => {
    sel.text.deselect()
  }, [setUI])

  // Column header is selected when cursor is directly on this column node.
  // Uses per-node cursor signal — avoids reading global cursorDepth.
  const isColumnSelected = colCursorOnThis

  // Column selection: subtle primary bg tint only when cursor is at column level.
  const colTheme = useTheme()
  const columnBg = isColumnSelected ? selectedBg(colTheme) : undefined

  // Derive column header presentation props (icon, colors, style).
  // When the lens/repo lookup fails (rare), fall back to a minimal stub so
  // the header still renders without crashing.
  const headerNode: KNode = colNode ?? ({ id: nodeId, type: "h", content: "" } as unknown as KNode)
  const { ownColor, headerStyle, icon, typeSuffix } = deriveColumnHeaderProps(repo, headerNode, {
    iconStyle,
    isSelected,
    isColumnSelected,
    isVirtual,
    isInlineEditing,
  })

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(name, nodeId, colNode?.fs_path),
    [name, nodeId, colNode?.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Card list: prefer Board-supplied filtered IDs (text/property filters).
  // Otherwise use ViewTree childIds (filtered by lens for task status, hidden nodes).
  // Final fallback: direct lens children (when ViewTree is not yet populated).
  const viewTree = useViewTree()
  const cardNodes = useMemo(() => {
    // Explicit filter overlay wins — Board.tsx computed this for us.
    if (filteredCardIds !== undefined) {
      return filteredCardIds.map((id) => repo.getNode(id)).filter((n): n is KNode => n != null)
    }
    // Prefer reactive ViewTree childIds (filtered by lens).
    if (colViewNode) {
      return colViewNode.childIds.map((id) => repo.getNode(id)).filter((n): n is KNode => n != null)
    }
    // Fallback: direct lens children.
    return lensCardIds.map((id) => repo.getNode(id)).filter((n): n is KNode => n != null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lensCardIds tracked via lens signal
  }, [filteredCardIds, colViewNode?.childIds, lensCardIds, repo])
  const bodyCardIds = useMemo(() => {
    if (!viewTree) return new Set<string>()
    const ids = new Set<string>()
    for (const card of cardNodes) {
      const proj = viewTree.getProjected(card.id) ?? viewTree.track(card.id)
      if (proj?.isBody()) ids.add(card.id)
    }
    return ids
  }, [viewTree, cardNodes])

  // Stable renderItem callback — doesn't depend on cardIndex.
  // Cards get selection state from NodeStore self-subscription.
  const renderItem = useCallback(
    (card: KNode, actualIndex: number) => {
      layoutLog.trace?.(
        `CardColumn card: col=${colIndex} idx=${actualIndex} node=${sid(card.id)} content=${card.content?.slice(0, 30) ?? "(empty)"}`,
      )
      // For body blocks: compute neighbor info for layout stability.
      // Only yield paddingTop when prev is also a body block (not structural).
      // Last body block before a structural card gets paddingBottom=1.
      const cardIsBody = bodyCardIds.has(card.id)
      const isBody = isVirtual || cardIsBody
      const prevCard = actualIndex > 0 ? cardNodes[actualIndex - 1] : undefined
      const nextCard = actualIndex < cardNodes.length - 1 ? cardNodes[actualIndex + 1] : undefined
      const isPrevBody = isVirtual || (prevCard ? bodyCardIds.has(prevCard.id) : false)
      const isLastBody = isBody && (!nextCard || !(isVirtual || bodyCardIds.has(nextCard.id)))
      return (
        <Card
          key={`${card.id}-${actualIndex}`}
          card={card}
          width={width - 1}
          colIndex={colIndex}
          cardIndex={actualIndex}
          isBodyColumn={isVirtual}
          isBodyCard={cardIsBody}
          isPrevBodyBlock={isPrevBody}
          isLastBodyBlock={isLastBody}
          extraExcludedSigils={extraExcludedSigils}
          isColumnSelected={isColumnSelected}
          prevCardNodeId={prevCard?.id}
        />
      )
    },
    [colIndex, width, isVirtual, cardNodes, bodyCardIds, extraExcludedSigils, isColumnSelected],
  )

  const getKey = useCallback((card: KNode) => card.id, [])

  // Collapsed: bordered card-like strip spanning full column height with vertical title
  if (isCollapsed) {
    // Build vertical text: one char per row from column name
    // Account for border (2 rows) and count line (1 row)
    const verticalChars = name.slice(0, Math.max(0, height - 3)).split("")
    const countStr = String(count)
    const borderColor = isColumnSelected ? "$selection-bg" : "$surface-bg"
    return (
      <Box
        id={nodeId}
        data-view="column"
        data-column={true}
        data-col-index={colIndex}
        data-collapsed={true}
        {...(isSelected && { "data-selected": true })}
        {...(isColumnSelected && { "data-cursor": true, "data-card-index": -1 })}
        flexDirection="column"
        width={width}
        height={height}
        overflow="hidden"
      >
        <Box
          flexDirection="column"
          width={width}
          flexGrow={1}
          borderStyle="round"
          borderColor={borderColor}
          overflow="hidden"
          backgroundColor={isColumnSelected ? "$selection-bg" : undefined}
        >
          {/* Vertical title — one char per row, top-aligned */}
          {verticalChars.map((ch, i) => (
            <Box key={i} height={1} flexShrink={0}>
              <Text bold color={isColumnSelected ? "$selection" : (ownColor ?? "$muted")} dimColor={!isColumnSelected}>
                {ch}
              </Text>
            </Box>
          ))}
          {/* Count at bottom, pushed down by flexGrow on spacer */}
          <Box flexGrow={1} />
          <Box height={1} flexShrink={0}>
            <Text bold dimColor={!isColumnSelected} color={isColumnSelected ? "$selection" : undefined}>
              {countStr}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Box
      id={nodeId}
      data-view="column"
      data-column={true}
      data-col-index={colIndex}
      {...(isSelected && { "data-selected": true })}
      {...(isColumnSelected && { "data-cursor": true, "data-card-index": -1 })}
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      backgroundColor={columnBg}
    >
      {/* Column header — unified NodeView component */}
      <ColumnHeader
        node={headerNode}
        displayName={name}
        untitled={untitled}
        ownColor={ownColor}
        headerStyle={headerStyle}
        icon={icon}
        cardCount={count}
        width={width - 1}
        isColumnSelected={isColumnSelected}
        isSelected={isSelected}
        isVirtual={isVirtual}
        wipLimit={wipLimit}
        typeSuffix={typeSuffix}
        showSeparator
      >
        {isInlineEditing && colNode ? (
          <InlineEditField
            initialValue={composeRawEditContent(colNode)}
            onConfirm={handleInlineEditConfirm}
            onCancel={handleInlineEditCancel}
          />
        ) : undefined}
      </ColumnHeader>

      {cardNodes.length > 0 ? (
        <ScrollTrackingVirtualList
          isSelected={isSelected}
          items={cardNodes}
          width={width - 1}
          height={height - 2}
          estimateHeight={ESTIMATED_CARD_HEIGHT}
          overscan={OVERSCAN}
          getKey={getKey}
          renderItem={renderItem}
          overflowIndicator
          scrollAnchor={columnScrollAnchor}
          listFooter={
            hiddenCount > 0 ? (
              <Box flexDirection="column" height={2} alignItems="center">
                <Box height={1} />
                <Text color="$muted">+{hiddenCount} filtered</Text>
              </Box>
            ) : undefined
          }
        />
      ) : isLoading ? (
        <SkeletonCards width={width - 1} height={height - 2} colIndex={colIndex} />
      ) : (
        <Box flexDirection="column" flexGrow={1} minHeight={1}>
          <Box marginTop={1} paddingLeft={3}>
            <Small>(empty)</Small>
          </Box>
        </Box>
      )}
    </Box>
  )
})
