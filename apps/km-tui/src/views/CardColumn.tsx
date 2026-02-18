/**
 * Card and Column components for the Board view
 *
 * Uses inkx VirtualList for React-level virtualization of large card lists.
 */
import React, { useCallback, useEffect, useMemo } from "react"
import { useApp as useAppStore } from "inkx/runtime"
import { useRepo } from "../repo-context.tsx"
import { layoutLog, sid } from "../log.ts"
import { Box, Text, useScreenRectCallback } from "inkx"
import { styledUnderline } from "chalkx"
import type { JobRunner } from "@km/core"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import type { CardState, ColumnState } from "../types.ts"
import { makeSelectionKey } from "../types.ts"
import type { BoardAppStore } from "../board-app-store.ts"
import { getNodeDisplayName, isNodeUntitled, getCollapsedTypeSuffix } from "../state.ts"
import { getOwnColor, getHeaderStyle } from "../board-pills.ts"
import { TreeNode } from "./TreeNode.tsx"
import { getColumnHeaderIcon, isSigilName, renderPlain } from "../text/index.ts"
import { useNavigator } from "../layout-context.tsx"
import { useUISelector, useSetUI, deriveColumnExcludedSigils, useTreeRenderContext } from "../ui-context.tsx"
import { InlineEditField } from "./InlineEditField.tsx"
import { useIsColumnSelected, useIsCursorAtCard } from "../cursor-context.tsx"
import { ScrollTrackingVirtualList } from "./ScrollTracker.tsx"
import { isHRContent } from "./tree-node-helpers.ts"

// =============================================================================
// Virtualization Constants
// =============================================================================

/**
 * Estimated card height in rows (border + content + padding).
 * Cards in CARDS view are taller (have borders) compared to COLUMNS view.
 */
const ESTIMATED_CARD_HEIGHT = 4

/**
 * Number of extra cards to render above and below visible area.
 * Lower than COLUMNS view (20) because cards are taller, so fewer fit on screen.
 */
const OVERSCAN = 15

/**
 * Maximum number of cards to render at once.
 * Lower than COLUMNS view (100) because cards are more expensive to render
 * (have borders, more complex layout).
 */
const MAX_RENDERED_CARDS = 50

// =============================================================================
// Card Component
// =============================================================================

interface CardProps {
  card: CardState
  selectedSubIndex: number
  width: number
  colIndex: number
  cardIndex: number
  /** True if this card is in a virtual body column (renders borderless) */
  isVirtualColumn?: boolean
  /** True if the previous card is also a body block (for yield logic) */
  isPrevBodyBlock?: boolean
  /** True if this is the last body block before a structural card or end of column */
  isLastBodyBlock?: boolean
  /** Additional sigils to exclude from card content (e.g., column-level sigils) */
  extraExcludedSigils?: string[]
  /** True if the parent column is at column-level selection (cursor on column header) */
  isColumnSelected?: boolean
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
function CardLayoutRegistrar({
  colIndex,
  cardIndex,
}: {
  colIndex: number
  cardIndex: number
  nodeId: string
}): null {
  const registry = useNavigator()

  const handleLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry) {
        layoutLog.trace?.(`CardLayoutRegistrar: no registry for col=${colIndex} card=${cardIndex}`)
        return
      }

      layoutLog.trace?.(`CardLayoutRegistrar: col=${colIndex} card=${cardIndex} y=${computed.y} h=${computed.height}`)
      registry.register(colIndex, cardIndex, { x: computed.x, y: computed.y, width: computed.width, height: computed.height })
    },
    [registry, colIndex, cardIndex],
  )

  useScreenRectCallback(handleLayout)

  // Clean up registry entry when VirtualList unmounts this card.
  // Without this, stale entries with old screen positions remain in the
  // registry after scrolling, causing findItemAtY to return the wrong
  // card during h/l navigation (stickyY intersects stale bounding box).
  useEffect(() => {
    return () => {
      registry?.unregister(colIndex, cardIndex)
    }
  }, [registry, colIndex, cardIndex])

  return null
}

const Card = React.memo(
  function Card({
    card,
    selectedSubIndex,
    width,
    colIndex,
    cardIndex,
    isVirtualColumn,
    isPrevBodyBlock,
    isLastBodyBlock,
    extraExcludedSigils,
    isColumnSelected: isColSelected = false,
  }: CardProps): React.ReactElement {
    const nodeId = card.node.id

    // Get selection state exclusively from CursorStore (self-subscription).
    // Only this card and the previously-selected card re-render on j/k.
    const isSelected = useIsCursorAtCard(colIndex, cardIndex)

    // Check if the card ABOVE is at cursor position. Used by body blocks:
    // yield paddingTop only when prev is a BODY block at cursor (not structural).
    // Structural cards always have borders — their borderBottom doesn't change
    // with cursor, so body blocks after them keep constant paddingTop=1.
    const isPrevAtCursor = useIsCursorAtCard(colIndex, cardIndex - 1)

    // Check if this card is in inline edit mode (for border color)
    const isEditing = useUISelector((state) => state.inlineEditBlock?.nodeId === nodeId)

    // Check if this card is part of a multi-selection (Shift+J/K or Shift+H/L)
    const isMultiSelected = useUISelector((state) => state.multiSelected.has(makeSelectionKey(nodeId, 0)))

    // Compute overflow: check if any children are hidden by maxContentLines.
    // Mirrors TreeNode's logic: check root's direct children AND grandchildren.
    const repo = useRepo()
    const { treeConfig } = useTreeRenderContext()
    const maxChildren = treeConfig.maxContentLines
    const directHidden = Math.max(0, (card.childCount ?? 0) - maxChildren)
    const { hasOverflow, hiddenCount } = useMemo(() => {
      let total = directHidden
      const visibleChildren = card.children.slice(0, maxChildren)
      for (const child of visibleChildren) {
        const grandchildren = repo.getChildren(child.id)
        if (grandchildren.length > maxChildren) {
          total += grandchildren.length - maxChildren
        }
      }
      return { hasOverflow: total > 0, hiddenCount: total }
    }, [directHidden, card.children, maxChildren, repo])

    // HR nodes render as borderless centered content (unless being edited,
    // in which case they fall through to normal bordered card with InlineEditField).
    // Detection is content-based: editing "---" to "---f" should stop rendering as HR.
    // Nodes with type="hr" and no content default to "---".
    const hrContent = (card.node.content ?? (card.node.type === "hr" ? "---" : "")).trim()
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
    const yieldTop = isPrevBodyBlock && isPrevAtCursor

    if (isHR && !isEditing) {
      const innerWidth = width - 2 // border or padding L+R both consume 2
      const padTotal = Math.max(0, innerWidth - hrContent.length)
      const padLeft = Math.floor(padTotal / 2)
      return (
        <Box
          flexDirection="column"
          flexShrink={0}
          width={width}
          {...bodyBlockLayoutProps(isSelected, "yellow", yieldTop, isLastBodyBlock, isMultiSelected, isColSelected)}
        >
          <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
          <Box
            id={nodeId}
            data-view="item"
            {...(isSelected && {
              "data-cursor": true,
              "data-col-index": colIndex,
              "data-card-index": cardIndex,
            })}
          >
            <Text
              color={isSelected || isMultiSelected ? "yellow" : undefined}
              dimColor={!isSelected && !isMultiSelected}
              wrap="truncate"
            >
              {" ".repeat(padLeft)}{hrContent}
            </Text>
          </Box>
        </Box>
      )
    }

    if (isVirtualColumn || card.isVirtual) {
      const bodyBorderColor = isEditing ? "cyan" : "yellow"
      return (
        <Box
          flexDirection="column"
          flexShrink={0}
          width={width}
          {...bodyBlockLayoutProps(isSelected || isEditing, bodyBorderColor, yieldTop, isLastBodyBlock, isMultiSelected, isColSelected)}
        >
          <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
          <TreeNode
            node={card.node}
            depth={0}
            isSelected={isSelected}
            colIndex={colIndex}
            cardIndex={cardIndex}
            subIndex={0}
            dim={!isSelected}
            dimInactiveChildren={true}
            childCount={card.childCount}
            extraExcludedSigils={extraExcludedSigils}
            compactContent

          />
        </Box>
      )
    }

    // Border: cyan when editing, yellow when selected/multi-selected/column-selected, gray otherwise
    const borderColor = isEditing ? "cyan" : isSelected || isMultiSelected || isColSelected ? "yellow" : "blackBright"

    // When overflow, suppress the bottom border and render a custom one with the count
    if (hasOverflow) {
      // Inner width excludes the 2 border columns (left + right)
      const innerWidth = Math.max(0, width - 2)
      const label = ` +${hiddenCount} `
      const padding = Math.max(0, innerWidth - label.length)
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad

      return (
        <Box flexDirection="column" flexShrink={0} width={width}>
          <Box
            flexDirection="column"
            width={width}
            borderStyle="round"
            borderBottom={false}
            borderColor={borderColor}
          >
            <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
            <TreeNode
              node={card.node}
              depth={0}
              isSelected={isSelected && selectedSubIndex <= 0}
              colIndex={colIndex}
              cardIndex={cardIndex}
              subIndex={0}
              dimInactiveChildren={!isSelected && !isMultiSelected}
              childCount={card.childCount}
              extraExcludedSigils={extraExcludedSigils}
            />
          </Box>
          <Box width={width} height={1} flexShrink={0}>
            <Text color={borderColor} wrap="truncate">
              <Text color={borderColor}>╰{"─".repeat(leftPad)}</Text>
              <Text dimColor> +{hiddenCount} </Text>
              <Text color={borderColor}>{"─".repeat(rightPad)}╯</Text>
            </Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box
        flexDirection="column"
        flexShrink={0}
        width={width}
        borderStyle="round"
        borderColor={borderColor}
      >
        <CardLayoutRegistrar colIndex={colIndex} cardIndex={cardIndex} nodeId={nodeId} />
        <TreeNode
          node={card.node}
          depth={0}
          isSelected={isSelected && selectedSubIndex <= 0}
          colIndex={colIndex}
          cardIndex={cardIndex}
          subIndex={0}
          dimInactiveChildren={!isSelected && !isMultiSelected}
          childCount={card.childCount}
          extraExcludedSigils={extraExcludedSigils}
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
      prev.selectedSubIndex === next.selectedSubIndex &&
      prev.width === next.width &&
      prev.colIndex === next.colIndex &&
      prev.cardIndex === next.cardIndex &&
      prev.isPrevBodyBlock === next.isPrevBodyBlock &&
      prev.isLastBodyBlock === next.isLastBodyBlock &&
      prev.extraExcludedSigils === next.extraExcludedSigils &&
      prev.isColumnSelected === next.isColumnSelected
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
) {
  if (showBorder) return { borderStyle: "round" as const, borderColor }
  return {
    borderStyle: "round" as const,
    borderColor: isMultiSelected || isColumnSelected ? "yellow" : "gray",
    borderDimColor: !isMultiSelected && !isColumnSelected,
  }
}

// =============================================================================
// Column Component
// =============================================================================

interface ColumnProps {
  column: ColumnState
  colIndex: number
  isCollapsed: boolean
  selectedSubIndex: number
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
  selectedSubIndex,
  width,
  height,
}: ColumnProps): React.ReactElement {
  const repo = useRepo()
  const setUI = useSetUI()
  const {
    treeConfig: { iconStyle },
  } = useTreeRenderContext()
  const jobRunner = useAppStore<BoardAppStore, JobRunner>((s) => s.jobRunner)
  const undoHandle = useAppStore<BoardAppStore, UndoableRepoHandle>((s) => s.undoHandle)
  const nodeId = column.node.id

  // Subscribe to column selection only (stable on j/k within same column).
  // ScrollTrackingVirtualList handles cardIndex subscription.
  const columnSelected = useIsColumnSelected(colIndex)
  const isSelected = columnSelected.isSelected
  const selectionLevel = columnSelected.selectionLevel

  // Check if this column header is being inline-edited
  const isInlineEditing = useUISelector((state) => state.inlineEditBlock?.nodeId === nodeId)

  // Render name with wiki links stripped: [[target|alias]] → "alias"
  const name = renderPlain(getNodeDisplayName(repo, column.node))
  const untitled = isNodeUntitled(repo, column.node)
  const typeSuffix = getCollapsedTypeSuffix(repo, column.node)
  const count = column.cards.length
  const wipLimit = column.wipLimit
  const isVirtual = column.isVirtual ?? false

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

  // Get column's own color (not inherited) for background
  // Virtual body columns use dimmed gray styling
  const ownColor = isVirtual ? undefined : getOwnColor(column.node)
  const wipExceeded = wipLimit !== undefined && count > wipLimit

  // Build count display
  const countDisplay = wipLimit !== undefined ? `${count}/${wipLimit}` : `${count}`
  const warningIndicator = wipExceeded ? " \u26A0" : ""
  const collapsedIndicator = isCollapsed ? " \u25B8" : ""

  const isColumnSelected = isSelected && selectionLevel === "column"
  const headerStyle = isInlineEditing
    ? {
        color: "cyan",
        backgroundColor: undefined as string | undefined,
        dimColor: false,
      }
    : getHeaderStyle(ownColor, isSelected, isColumnSelected)
  // Virtual body columns: dim header unless cursor is on column header
  if (isVirtual && !isColumnSelected) headerStyle.dimColor = true

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(name, column.node.id, column.node.fs_path),
    [name, column.node.id, column.node.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Stable renderItem callback — doesn't depend on cardIndex.
  // Cards get selection state from CursorStore self-subscription.
  const cards = column.cards
  const renderItem = useCallback(
    (card: CardState, actualIndex: number) => {
      layoutLog.trace?.(
        `CardColumn card: col=${colIndex} idx=${actualIndex} node=${sid(card.node.id)} content=${card.node.content?.slice(0, 30) ?? "(empty)"}`,
      )
      // For body blocks: compute neighbor info for layout stability.
      // Only yield paddingTop when prev is also a body block (not structural).
      // Last body block before a structural card gets paddingBottom=1.
      const isBody = isVirtual || card.isVirtual
      const prevCard = actualIndex > 0 ? cards[actualIndex - 1] : undefined
      const nextCard = actualIndex < cards.length - 1 ? cards[actualIndex + 1] : undefined
      const isPrevBody = isVirtual || (prevCard?.isVirtual ?? false)
      const isLastBody = isBody && (!nextCard || !(isVirtual || nextCard.isVirtual))
      return (
        <Card
          key={card.node.id}
          card={card}
          selectedSubIndex={selectedSubIndex}
          width={width - 1}
          colIndex={colIndex}
          cardIndex={actualIndex}
          isVirtualColumn={isVirtual}
          isPrevBodyBlock={isPrevBody}
          isLastBodyBlock={isLastBody}
          extraExcludedSigils={extraExcludedSigils}
          isColumnSelected={isColumnSelected}
        />
      )
    },
    [colIndex, selectedSubIndex, width, isVirtual, cards, extraExcludedSigils, isColumnSelected],
  )

  const keyExtractor = useCallback((card: CardState) => card.node.id, [])

  // Get icon based on style
  const icon = getColumnHeaderIcon(column.node, iconStyle, isVirtual, ownColor)
  const iconColor = isColumnSelected ? "black" : icon.color

  // Collapsed: bordered card-like strip spanning full column height with vertical title
  if (isCollapsed) {
    // Build vertical text: one char per row from column name
    // Account for border (2 rows) and count line (1 row)
    const verticalChars = name.slice(0, Math.max(0, height - 3)).split("")
    const countStr = String(count)
    const borderColor = isColumnSelected ? "yellow" : "black"
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
          backgroundColor={isColumnSelected ? "yellow" : undefined}
        >
          {/* Vertical title — one char per row, top-aligned */}
          {verticalChars.map((ch, i) => (
            <Box key={i} height={1} flexShrink={0}>
              <Text
                bold={isColumnSelected}
                color={isColumnSelected ? "black" : (ownColor ?? "gray")}
                dimColor={!isColumnSelected}
              >
                {ch}
              </Text>
            </Box>
          ))}
          {/* Count at bottom, pushed down by flexGrow on spacer */}
          <Box flexGrow={1} />
          <Box height={1} flexShrink={0}>
            <Text
              dimColor={!isColumnSelected}
              color={isColumnSelected ? "black" : undefined}
            >
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
      {/* Column header row — paddingLeft aligns icon with card content (cards have 1-char border) */}
      <Box height={1} flexShrink={0} width={width - 1} flexDirection="row">
        <Box flexGrow={1} flexShrink={1} flexDirection="row" paddingLeft={1} paddingRight={1} backgroundColor={headerStyle.backgroundColor}>
          {isInlineEditing ? (
            <Text bold color={headerStyle.color} wrap="truncate">
              <Text color={iconColor}>{icon.char}</Text>{" "}
              <InlineEditField
                initialValue={name}
                onConfirm={handleInlineEditConfirm}
                onCancel={handleInlineEditCancel}
              />
            </Text>
          ) : (
            <>
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <Text bold={!isVirtual} color={headerStyle.color} dimColor={headerStyle.dimColor} wrap="truncate">
                  <Text color={iconColor}>{icon.char}</Text>{" "}
                  <Text color={isColumnSelected ? undefined : ownColor}>
                    {untitled ? (
                      <Text dimColor color="gray">
                        {name}
                      </Text>
                    ) : (
                      name
                    )}
                    {!isVirtual && isSigilName(column.node.name) && column.node.name !== name && (
                      <>
                        {" "}
                        <Text dimColor>{column.node.name}</Text>
                      </>
                    )}
                  </Text>
                  {typeSuffix ? (
                    <Text
                      color={isColumnSelected ? "gray" : undefined}
                      dimColor={!isColumnSelected}
                    >{` ${typeSuffix}`}</Text>
                  ) : (
                    ""
                  )}
                  {collapsedIndicator}
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text color={headerStyle.color} dimColor={headerStyle.dimColor}>
                  {wipExceeded ? (
                    <Text color="red">{` ${styledUnderline("curly", [255, 80, 80], countDisplay)}${warningIndicator}`}</Text>
                  ) : (
                    <Text color={isColumnSelected ? headerStyle.color : "gray"}>
                      {` ${countDisplay}`}
                    </Text>
                  )}
                </Text>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Separator line between header and cards */}
      <Box height={1} flexShrink={0} width={width - 1}>
        <Text color={isColumnSelected ? "yellow" : undefined} dimColor={!isColumnSelected}>
          {"\u2500".repeat(Math.max(0, width - 1))}
        </Text>
      </Box>

      {column.cards.length > 0 ? (
        <ScrollTrackingVirtualList
          colIndex={colIndex}
          isSelected={isSelected}
          items={column.cards}
          width={width - 1}
          height={height - 2}
          itemHeight={ESTIMATED_CARD_HEIGHT}
          overscan={OVERSCAN}
          maxRendered={MAX_RENDERED_CARDS}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          overflowIndicator
        />
      ) : (
        <Box flexDirection="column" flexGrow={1} minHeight={1}>
          <Box marginTop={1} paddingLeft={3}>
            <Text dimColor>(empty)</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
})
