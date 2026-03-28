/**
 * Card and Column components for the Board view
 *
 * Uses silvery VirtualList for React-level virtualization of large card lists.
 *
 * NODE MODEL V2: Receives ColumnView with CardView cards.
 * "column" is a parent KNode wrapped in ColumnView, "card" is a CardView (KNode + resolved embed data).
 */
import React, { useCallback, useEffect, useMemo } from "react"
import { useApp as useAppStore } from "@silvery/create/create-app"
import { useRepo } from "../repo-context.tsx"
import { layoutLog, sid } from "../log.ts"
import { useComponentTiming } from "../hooks/use-component-timing.ts"
import { Box, Text, Small, useScreenRectCallback } from "@silvery/ag-react"
import type { JobRunner } from "@km/core"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import { isDetailViewPane } from "../board-types.ts"
import type { CardView, ColumnView } from "../types.ts"
import { makeSelectionKey } from "../types.ts"
import type { KNode } from "@km/core"
import { getActiveBoardPane, type BoardAppStore } from "../board-app-store.ts"
import { getNodeDisplayName, isNodeUntitled } from "../state.ts"
import { TreeNode } from "./TreeNode.tsx"
import { parseToPlainText, InlineText } from "../text/index.ts"
import { displayLength } from "../text/rich.ts"
import { ColumnHeader, deriveColumnHeaderProps } from "./NodeView.tsx"
import { useNavigator } from "../layout-context.tsx"
import { usePaneId } from "../pane-context.tsx"
import { useUISelector, useSetUI, deriveColumnExcludedSigils, useTreeRenderContext } from "../ui-context.tsx"
import { InlineEditField } from "./InlineEditField.tsx"
import { useNodeStore, useReactive } from "../reactive.ts"
import { ScrollTrackingVirtualList } from "./ScrollTracker.tsx"
import { isHRContent } from "./tree-node-helpers.tsx"
import { isCollapsedChild } from "../hooks/use-columns.ts"
import { useCardInteraction } from "../hooks/use-card-interaction.ts"

// =============================================================================
// Virtualization Constants
// =============================================================================

/**
 * Estimated card height in rows (border + content + padding).
 * Cards in CARDS view are taller (have borders) compared to COLUMNS view.
 */
const _ESTIMATED_CARD_HEIGHT = 4

/**
 * Number of extra cards to render above and below visible area.
 * TUI scrolling is discrete (j/k keys), so 2 is sufficient to prevent pop-in.
 */
const OVERSCAN = 2

/**
 * Maximum number of cards to render at once.
 * Cards are expensive (~15 hooks each), so keep this tight. VirtualList will
 * always window the list — no bypass for small columns.
 */
const MAX_RENDERED_CARDS = 20

// =============================================================================
// Card Component
// =============================================================================

export interface CardProps {
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
 * Layout registration: Uses useScreenRectCallback to register screen positions
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

  useScreenRectCallback(handleLayout)

  // Clean up registry entry when VirtualList unmounts this card.
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

export const Card = React.memo(
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
    isBodyCard = false,
    childCount: childCountProp,
  }: CardProps): React.ReactElement {
    const nodeId = card.id

    // Get selection state from ReactiveNodeStore (self-subscription via nodeId).
    // NODE MODEL V2: Cards self-select by nodeId instead of positional indices.
    // Only this card and the previously-selected card re-render on j/k.
    const nodeStore = useNodeStore()
    const cursorCardNodeId = useReactive(nodeStore.cursorCardNodeId)
    const selLevel = useReactive(nodeStore.selectionLevel)
    const isSelected = cursorCardNodeId === nodeId && selLevel === "card"

    // Hover + click interaction (border highlight, click-to-select, Cmd+click-to-navigate)
    const { hoverBorderColor, handlers: hoverHandlers } = useCardInteraction(nodeId, isSelected || isColSelected)

    // Check if the card ABOVE is at cursor position. Used by body blocks:
    // yield paddingTop only when prev is a BODY block at cursor (not structural).
    // NODE MODEL V2: Self-selecting via prevCardNodeId instead of positional indices.
    const isPrevAtCursor = prevCardNodeId != null && cursorCardNodeId === prevCardNodeId && selLevel === "card"

    // Check if this card is in inline edit mode (for border color)
    const isEditing = useAppStore<BoardAppStore, boolean>(
      (s) => getActiveBoardPane(s)?.inlineEditBlock?.nodeId === nodeId,
    )

    // Check if this card is part of a multi-selection (Shift+J/K or Shift+H/L)
    const isMultiSelected = useAppStore<BoardAppStore, boolean>(
      (s) => getActiveBoardPane(s)?.multiSelected.has(makeSelectionKey(nodeId)) ?? false,
    )

    // Compute overflow: check if any children are hidden by maxContentLines.
    // Mirrors TreeNode's logic: check root's direct children AND grandchildren.
    // Also accounts for title wrap lines (long titles that wrap to 2 lines).
    const repo = useRepo()
    const { treeConfig } = useTreeRenderContext()
    const maxChildren = treeConfig.maxContentLines
    const rawChildren = useMemo(() => repo.getChildren(card.id), [repo, card.id])
    // Filter out collapsed children (km.collapse:: true, detailOnly) — these are
    // only shown in the detail pane and must not inflate the overflow count.
    const children = useMemo(() => rawChildren.filter((c) => !isCollapsedChild(c)), [rawChildren])
    const childCount = childCountProp ?? children.length
    const directHidden = Math.max(0, childCount - maxChildren)
    const { hasOverflow, hiddenCount } = useMemo(() => {
      let total = directHidden
      const visibleChildren = children.slice(0, maxChildren)
      for (const child of visibleChildren) {
        const grandchildren = repo.getChildren(child.id)
        if (grandchildren.length > maxChildren) {
          total += grandchildren.length - maxChildren
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
    }, [directHidden, children, maxChildren, repo, card, treeConfig.cardInnerWidth])

    // HR nodes render as borderless centered content (unless being edited,
    // in which case they fall through to normal bordered card with InlineEditField).
    // Detection is content-based: editing "---" to "---f" should stop rendering as HR.
    // Nodes with type="hr" and no content default to "---".
    const hrContent = (card.content ?? (card.type === "hr" ? "---" : "")).trim()
    const isHR = isHRContent(hrContent)
    // Body block layout props: border when focused, padding otherwise.
    // Layout stability invariant: cursoring must NOT shift content.
    //
    // How it works:
    // - Middle body blocks: paddingTop=1, paddingBottom=0 → H+1
    // - Last body block (before structural/end): paddingTop=1, paddingBottom=1 → H+2
    // - Selected: border top+bottom → H+2
    //
    // When a middle block is selected (H+1 → H+2, +1), the next block
    // yields its paddingTop (1→0, -1). Net: 0 shift.
    // When the last body block is selected (H+2 → H+2). Net: 0 shift.
    const yieldTop = !!(isPrevBodyBlock && isPrevAtCursor)
    const bodyDefaultBorder = treeConfig.borderMode === "black" ? "$surface-bg" : "$muted"

    if (isHR && !isEditing) {
      // HR cards render borderless with padding (matching border width) for alignment.
      // Padding on all 4 sides matches border dimensions for layout stability.
      // When selected, they get a yellow border like other body blocks.
      const hrLayoutProps = isSelected
        ? { borderStyle: "round" as const, borderColor: "$selection-bg" }
        : isMultiSelected || isColSelected
          ? { borderStyle: "round" as const, borderColor: "$selection-bg" }
          : { paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1 }
      return (
        <Box
          data-view="card"
          data-card-id={nodeId}
          flexDirection="column"
          flexShrink={0}
          width={width}
          {...hrLayoutProps}
          {...hoverHandlers}
        >
          <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
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
              color={isSelected || isMultiSelected ? "$selection-bg" : undefined}
              dimColor={!isSelected && !isMultiSelected}
              wrap="truncate"
            >
              {hrContent}
            </Text>
          </Box>
        </Box>
      )
    }

    if (isBodyColumn || isBodyCard) {
      const bodyBorderColor = isEditing ? "$focusborder" : "$selection-bg"
      return (
        <Box
          data-view="card"
          data-card-id={nodeId}
          flexDirection="column"
          flexShrink={0}
          width={width}
          {...bodyBlockLayoutProps(
            isSelected || isEditing,
            bodyBorderColor,
            yieldTop,
            !!isLastBodyBlock,
            isMultiSelected,
            isColSelected,
            bodyDefaultBorder,
          )}
          {...hoverHandlers}
        >
          <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
          <TreeNode
            node={card}
            depth={0}
            remainingDepth={2}
            isSelected={isSelected}
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
        isSelected || isMultiSelected || isColSelected ? "$selection-bg" : (hoverBorderColor ?? "$muted")
      return (
        <Box
          data-view="card"
          data-card-id={nodeId}
          flexDirection="column"
          flexShrink={0}
          width={width}
          borderStyle="round"
          borderColor={collapsedBorder}
          {...hoverHandlers}
        >
          <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
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
            <Text dimColor={!isSelected && !isMultiSelected} wrap="truncate">
              <InlineText text={collapsedTitleText} />
              {childCount > 0 ? ` ··· ${childCount}` : " ···"}
            </Text>
          </Box>
        </Box>
      )
    }

    // Border: cyan when editing, yellow when selected/multi-selected/column-selected, default otherwise
    // Done/dropped tasks get a darker border to visually de-emphasize them
    const isDoneOrDropped = card.task_status === "done" || card.task_status === "dropped"
    const defaultBorder = isDoneOrDropped ? "$muted" : treeConfig.borderMode === "black" ? "$surface-bg" : "$border"
    const borderColor = isEditing
      ? "$focusborder"
      : isSelected || isMultiSelected || isColSelected
        ? "$selection-bg"
        : (hoverBorderColor ?? defaultBorder)
    // When overflow, suppress the bottom border and render a custom one with the count
    if (hasOverflow) {
      // Inner width excludes the 2 border columns (left + right)
      const innerWidth = Math.max(0, width - 2)
      const label = ` +${hiddenCount} `
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
          {...hoverHandlers}
        >
          <Box flexDirection="column" width={width} borderStyle="round" borderBottom={false} borderColor={borderColor}>
            <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
            <TreeNode
              node={card}
              depth={0}
              remainingDepth={2}
              isSelected={isSelected}
              colIndex={colIndex}
              cardIndex={cardIndex}
              dimInactiveChildren={false}
              childCount={childCount}
              extraExcludedSigils={extraExcludedSigils}
              hideChildCount
            />
          </Box>
          <Box width={width} height={1} flexShrink={0}>
            <Text color={borderColor} wrap="truncate">
              <Text color={borderColor}>╰{"─".repeat(leftPad)}</Text>
              <Text color="$disabled-fg"> +{hiddenCount} </Text>
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
        borderStyle="round"
        borderColor={borderColor}
        {...hoverHandlers}
      >
        <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
        <TreeNode
          node={card}
          depth={0}
          remainingDepth={2}
          isSelected={isSelected}
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
    // Reference equality on card — structural sharing in useColumns ensures
    // unchanged cards keep the same object reference across re-derivations.
    // isSelected is driven by CursorStore self-subscription (not props),
    // so it's not compared here — CursorStore triggers re-renders independently.
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
// Body Block Layout
// =============================================================================

/** Shared layout props for body blocks (virtual cards and HRs).
 * Always uses border for consistent sizing — borderColor varies by state.
 * Layout invariant: selecting/deselecting must NOT shift content. */
function bodyBlockLayoutProps(
  showBorder: boolean,
  borderColor: string,
  _yieldTop: boolean,
  _isLastBodyBlock: boolean,
  isMultiSelected: boolean,
  isColumnSelected = false,
  defaultBorderColor = "$muted",
  _cursorDim = false,
) {
  if (showBorder) return { borderStyle: "round" as const, borderColor }
  return {
    borderStyle: "round" as const,
    borderColor: isMultiSelected || isColumnSelected ? "$selection-bg" : defaultBorderColor,
  }
}

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
  column: ColumnView
  colIndex: number
  isCollapsed: boolean
  width: number
  height: number
}

/**
 * Memoized Column - does NOT re-render on j/k within the same column.
 *
 * Column subscribes only to column selection state (stable on j/k).
 * ScrollTrackingVirtualList subscribes to cardIndex and passes scrollTo to VirtualList.
 * Cards get selection state from CursorStore self-subscription.
 * Result: j/k only re-renders ScrollTrackingVirtualList + VirtualList + 2 Cards.
 */
// oxlint-disable-next-line complexity/complexity -- React component — JSX ternaries inflate score
export const Column = React.memo(function Column({
  column,
  colIndex,
  isCollapsed,
  width,
  height,
}: ColumnProps): React.ReactElement {
  const repo = useRepo()
  const setUI = useSetUI()
  const {
    treeConfig: { iconStyle, borderMode: _borderMode, maxContentLines },
  } = useTreeRenderContext()
  const jobRunner = useAppStore<BoardAppStore, JobRunner>((s) => s.jobRunner)
  const undoHandle = useAppStore<BoardAppStore, UndoableRepoHandle>((s) => s.undoHandle)
  const nodeId = column.node.id

  // Per-column mount timing — measure render → commit duration
  useComponentTiming(`Column ${colIndex} "${column.node.title ?? column.node.name}" (${column.cardNodes.length} cards)`)

  // Subscribe to column selection only (stable on j/k within same column).
  // NODE MODEL V2: Self-select by nodeId instead of positional index.
  // ScrollTrackingVirtualList handles cardIndex subscription.
  const nodeStore = useNodeStore()
  const cursorColumnNodeId = useReactive(nodeStore.cursorColumnNodeId)
  const selectionLevel = useReactive(nodeStore.selectionLevel)
  const isSelected = cursorColumnNodeId === nodeId

  // Check if this column header is being inline-edited
  const isInlineEditing = useAppStore<BoardAppStore, boolean>(
    (s) => getActiveBoardPane(s)?.inlineEditBlock?.nodeId === nodeId,
  )

  // Scroll anchor for mouse wheel viewport scrolling (null = follow cursor)
  const columnScrollAnchor = useAppStore<BoardAppStore, number | null>((s) => {
    const pane = getActiveBoardPane(s)
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
  const name = parseToPlainText(getNodeDisplayName(repo, column.node))
  const untitled = isNodeUntitled(repo, column.node)
  const count = column.cardNodes.length
  const wipLimit = column.wipLimit
  const isVirtual = column.isVirtual ?? false
  const hiddenCards = (column.totalCardCount ?? column.cardNodes.length) - column.cardNodes.length
  const hiddenCount = hiddenCards + (column.hiddenDescendantCount ?? 0)

  // Inline edit callbacks — uses renameNode for backlink-safe renames
  const handleInlineEditConfirm = useCallback(
    (newValue: string) => {
      const node = repo.getNode(nodeId)
      const oldName = node?.name ?? ""
      const oldContent = (node?.content ?? "").replace(/^- \[.\]\s*/, "")

      // No-op: value didn't change
      if (newValue === (oldContent || oldName)) {
        setUI({ inlineEditBlock: null })
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
        repo.updateNode(nodeId, { content: newValue })
      }

      setUI({ inlineEditBlock: null })
    },
    [nodeId, repo, setUI, jobRunner, undoHandle],
  )

  const handleInlineEditCancel = useCallback(() => {
    setUI({ inlineEditBlock: null })
  }, [setUI])

  const isColumnSelected = isSelected && selectionLevel === "column"

  // Derive column header presentation props (icon, colors, style)
  const { ownColor, headerStyle, icon, typeSuffix, hasBody } = deriveColumnHeaderProps(repo, column.node, {
    iconStyle,
    isSelected,
    isColumnSelected,
    isVirtual,
    isInlineEditing,
  })

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(name, column.node.id, column.node.fs_path),
    [name, column.node.id, column.node.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Stable renderItem callback — doesn't depend on cardIndex.
  // Cards get selection state from CursorStore self-subscription.
  const cardNodes = column.cardNodes
  const renderItem = useCallback(
    (card: CardView, actualIndex: number) => {
      layoutLog.trace?.(
        `CardColumn card: col=${colIndex} idx=${actualIndex} node=${sid(card.id)} content=${card.content?.slice(0, 30) ?? "(empty)"}`,
      )
      // For body blocks: compute neighbor info for layout stability.
      // Only yield paddingTop when prev is also a body block (not structural).
      // Last body block before a structural card gets paddingBottom=1.
      const isBody = isVirtual || card.isBody
      const prevCard = actualIndex > 0 ? cardNodes[actualIndex - 1] : undefined
      const nextCard = actualIndex < cardNodes.length - 1 ? cardNodes[actualIndex + 1] : undefined
      const isPrevBody = isVirtual || (prevCard ? prevCard.isBody : false)
      const isLastBody = isBody && (!nextCard || !(isVirtual || nextCard.isBody))
      return (
        <Card
          key={`${card.id}-${actualIndex}`}
          card={card}
          width={width - 1}
          colIndex={colIndex}
          cardIndex={actualIndex}
          isBodyColumn={isVirtual}
          isBodyCard={card.isBody}
          isPrevBodyBlock={isPrevBody}
          isLastBodyBlock={isLastBody}
          extraExcludedSigils={extraExcludedSigils}
          isColumnSelected={isColumnSelected}
          prevCardNodeId={prevCard?.id}
        />
      )
    },
    [colIndex, width, isVirtual, cardNodes, extraExcludedSigils, isColumnSelected],
  )

  const keyExtractor = useCallback((card: KNode) => card.id, [])

  // Collapsed: bordered card-like strip spanning full column height with vertical title
  if (isCollapsed) {
    // Build vertical text: one char per row from column name
    // Account for border (2 rows) and count line (1 row)
    const verticalChars = name.slice(0, Math.max(0, height - 3)).split("")
    const countStr = String(count)
    const borderColor = isColumnSelected ? "$selection-bg" : "$surface-bg"
    return (
      <Box
        id={column.node.id}
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
              <Text
                bold={isColumnSelected}
                color={isColumnSelected ? "$selection" : (ownColor ?? "$muted")}
                dimColor={!isColumnSelected}
              >
                {ch}
              </Text>
            </Box>
          ))}
          {/* Count at bottom, pushed down by flexGrow on spacer */}
          <Box flexGrow={1} />
          <Box height={1} flexShrink={0}>
            <Text dimColor={!isColumnSelected} color={isColumnSelected ? "$selection" : undefined}>
              {countStr}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Box
      id={column.node.id}
      data-view="column"
      data-column={true}
      data-col-index={colIndex}
      {...(isSelected && { "data-selected": true })}
      {...(isColumnSelected && { "data-cursor": true, "data-card-index": -1 })}
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
    >
      {/* Column header — unified NodeView component */}
      <ColumnHeader
        node={column.node}
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
        hasBody={hasBody}
        typeSuffix={typeSuffix}
        showSeparator
      >
        {isInlineEditing ? (
          <InlineEditField initialValue={name} onConfirm={handleInlineEditConfirm} onCancel={handleInlineEditCancel} />
        ) : undefined}
      </ColumnHeader>

      {column.cardNodes.length > 0 ? (
        <ScrollTrackingVirtualList
          isSelected={isSelected}
          items={column.cardNodes}
          width={width - 1}
          height={height - 2}
          itemHeight={1}
          overscan={OVERSCAN}
          maxRendered={MAX_RENDERED_CARDS}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          overflowIndicator
          scrollAnchor={columnScrollAnchor}
          listFooter={
            hiddenCount > 0 ? (
              <Box flexDirection="column" height={2} alignItems="center">
                <Box height={1} />
                <Text color="$disabled-fg">+{hiddenCount} hidden</Text>
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
