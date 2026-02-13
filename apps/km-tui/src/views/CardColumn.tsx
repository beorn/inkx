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
import type { CardState, ColumnState } from "../types.ts"
import { makeSelectionKey } from "../types.ts"
import type { BoardAppStore } from "../board-app-store.ts"
import { getNodeDisplayName, isNodeUntitled, getCollapsedTypeSuffix } from "../state.ts"
import { getOwnColor, getHeaderStyle } from "../board-pills.ts"
import { TreeNode } from "./TreeNode.tsx"
import { getColumnHeaderIcon, isSigilName, renderPlain } from "../text/index.ts"
import { useLayoutRegistryOptional } from "../layout-context.tsx"
import { useUISelector, useSetUI, deriveColumnExcludedSigils, useTreeRenderContext } from "../ui-context.tsx"
import { InlineEditField } from "./InlineEditField.tsx"
import type { NodeLayout } from "../card-positions.ts"
import { useIsColumnSelected, useIsCursorAtCard } from "../cursor-context.tsx"
import { ScrollTrackingVirtualList } from "./ScrollTracker.tsx"

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
  /** Additional sigils to exclude from card content (e.g., column-level sigils) */
  extraExcludedSigils?: string[]
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
  nodeId,
}: {
  colIndex: number
  cardIndex: number
  nodeId: string
}): null {
  const registry = useLayoutRegistryOptional()

  const handleLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry) {
        layoutLog.trace?.(`CardLayoutRegistrar: no registry for col=${colIndex} card=${cardIndex}`)
        return
      }

      const layout: NodeLayout = {
        x: computed.x,
        y: computed.y,
        cardWidth: computed.width,
        cardHeight: computed.height,
      }

      layoutLog.trace?.(`CardLayoutRegistrar: col=${colIndex} card=${cardIndex} y=${computed.y} h=${computed.height}`)
      registry.registerCard(colIndex, cardIndex, nodeId, layout)
    },
    [registry, colIndex, cardIndex, nodeId],
  )

  useScreenRectCallback(handleLayout)

  // Clean up registry entry when VirtualList unmounts this card.
  // Without this, stale entries with old screen positions remain in the
  // registry after scrolling, causing findCardAtYVisual to return the wrong
  // card during h/l navigation (stickyY intersects stale bounding box).
  useEffect(() => {
    return () => {
      registry?.unregisterCard(colIndex, cardIndex)
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
    extraExcludedSigils,
  }: CardProps): React.ReactElement {
    const nodeId = card.node.id

    // Get selection state exclusively from CursorStore (self-subscription).
    // Only this card and the previously-selected card re-render on j/k.
    const isSelected = useIsCursorAtCard(colIndex, cardIndex)

    // Check if this card is in inline edit mode (for border color)
    const isEditing = useUISelector((state) => state.inlineEditBlock?.nodeId === nodeId)

    // Check if this card is part of a multi-selection (Shift+J/K or Shift+H/L)
    const isMultiSelected = useUISelector((state) => state.multiSelected.has(makeSelectionKey(nodeId, 0)))

    // Virtual body content renders with a very dim border and de-emphasized text
    // This includes: cards in virtual columns OR individual virtual body cards
    if (isVirtualColumn || card.isVirtual) {
      return (
        <Box
          flexDirection="column"
          flexShrink={0}
          width={width}
          borderStyle="round"
          borderColor={isSelected ? "yellow" : "black"}
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
          />
        </Box>
      )
    }

    // Border: cyan when editing, yellow when selected or multi-selected, gray otherwise
    const borderColor = isEditing ? "cyan" : isSelected || isMultiSelected ? "yellow" : "blackBright"

    return (
      <Box
        flexDirection="column"
        flexShrink={0}
        width={width}
        borderStyle="round"
        borderColor={borderColor}
        paddingRight={1}
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
    // Fast equality check for Card props.
    // isSelected is driven by CursorStore self-subscription (not props),
    // so it's not compared here — CursorStore triggers re-renders independently.
    return (
      prev.card.node.id === next.card.node.id &&
      prev.card.node.content === next.card.node.content &&
      prev.card.node.task_status === next.card.node.task_status &&
      prev.card.childCount === next.card.childCount &&
      prev.card.children?.length === next.card.children?.length &&
      prev.selectedSubIndex === next.selectedSubIndex &&
      prev.width === next.width &&
      prev.colIndex === next.colIndex &&
      prev.cardIndex === next.cardIndex &&
      prev.extraExcludedSigils === next.extraExcludedSigils
    )
  },
)

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
            repo.renameNode(nodeId, newValue, (info) => onProgress(info.updated, info.total))
          },
        })
      } else {
        // Name and content diverged — just update content, don't rename
        repo.updateNode(nodeId, { content: newValue })
      }

      setUI({ inlineEditBlock: null })
    },
    [nodeId, repo, setUI, jobRunner],
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
        color: "white",
        backgroundColor: "blueBright" as string | undefined,
        dimColor: false,
      }
    : getHeaderStyle(ownColor, isSelected, isColumnSelected)

  // Derive column-level excluded sigils (e.g., hide @next inside @next column)
  const columnExcludedSigils = useMemo(
    () => deriveColumnExcludedSigils(name, column.node.id, column.node.fs_path),
    [name, column.node.id, column.node.fs_path],
  )
  const extraExcludedSigils = columnExcludedSigils.length > 0 ? columnExcludedSigils : undefined

  // Stable renderItem callback — doesn't depend on cardIndex.
  // Cards get selection state from CursorStore self-subscription.
  const renderItem = useCallback(
    (card: CardState, actualIndex: number) => {
      layoutLog.trace?.(
        `CardColumn card: col=${colIndex} idx=${actualIndex} node=${sid(card.node.id)} content=${card.node.content?.slice(0, 30) ?? "(empty)"}`,
      )
      return (
        <Card
          key={card.node.id}
          card={card}
          selectedSubIndex={selectedSubIndex}
          width={width - 1}
          colIndex={colIndex}
          cardIndex={actualIndex}
          isVirtualColumn={isVirtual}
          extraExcludedSigils={extraExcludedSigils}
        />
      )
    },
    [colIndex, selectedSubIndex, width, isVirtual, extraExcludedSigils],
  )

  const keyExtractor = useCallback((card: CardState) => card.node.id, [])

  // Get icon based on style
  const icon = getColumnHeaderIcon(column.node, iconStyle, isVirtual, ownColor)
  const iconColor = isColumnSelected ? "black" : icon.color

  // Collapsed: thin vertical strip — first letter + count, navigable
  if (isCollapsed) {
    const firstChar = name.charAt(0).toUpperCase() || "\u25B8"
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
        maxHeight={height}
        overflow="hidden"
      >
        <Box height={1} flexShrink={0}>
          <Text> </Text>
        </Box>
        <Box height={1} flexShrink={0}>
          <Text
            bold={isColumnSelected}
            color={isColumnSelected ? "black" : (ownColor ?? "gray")}
            backgroundColor={isColumnSelected ? "yellow" : undefined}
            dimColor={!isColumnSelected}
          >
            {firstChar}
          </Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} minHeight={1}>
          <Text dimColor>{count}</Text>
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
      maxHeight={height}
      overflow="hidden"
    >
      {/* Blank line above header */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>

      {/* Column header with background spanning full width */}
      {/* Bold text, bullet uses icon style for consistent styling */}
      <Box height={1} flexShrink={0} width={width - 1} flexDirection="row">
        <Box width={1} flexShrink={0} />
        <Box flexGrow={1} flexDirection="row" backgroundColor={headerStyle.backgroundColor}>
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
                <Text bold color={headerStyle.color} dimColor={headerStyle.dimColor} wrap="truncate">
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
                    <Text color={isColumnSelected ? headerStyle.color : ownColor} dimColor={headerStyle.dimColor}>
                      {` ${countDisplay}`}
                    </Text>
                  )}
                </Text>
              </Box>
            </>
          )}
        </Box>
        <Box width={1} flexShrink={0} />
      </Box>

      {/* Separator line between header and cards */}
      <Box height={1} flexShrink={0} width={width - 1}>
        <Box width={1} flexShrink={0} />
        <Text color={isColumnSelected ? "yellow" : undefined} dimColor={!isColumnSelected}>
          {"─".repeat(Math.max(0, width - 3))}
        </Text>
      </Box>

      {column.cards.length > 0 ? (
        <ScrollTrackingVirtualList
          colIndex={colIndex}
          isSelected={isSelected}
          items={column.cards}
          height={height - 3}
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
