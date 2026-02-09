/**
 * Card and Column components for the Board view
 *
 * Uses inkx VirtualList for React-level virtualization of large card lists.
 */
import React, { useCallback } from "react"
import { useRepo } from "../repo-context.tsx"
import { layoutLog, sid } from "../log.ts"
import { Box, Text, useScreenRectCallback, VirtualList } from "inkx"
import { styledUnderline } from "chalkx"
import type { CardState, ColumnState } from "../types.ts"
import { getNodeDisplayName, getCollapsedTypeSuffix } from "../state.ts"
import { getOwnColor, getHeaderStyle } from "../board-pills.ts"
import { TreeNode } from "./TreeNode.tsx"
import { getNodeIcon, renderPlain } from "../text/index.ts"
import { useLayoutRegistryOptional } from "../layout-context.tsx"
import { useUISelector, useSetUI } from "../ui-context.tsx"
import { InlineEditField } from "./InlineEditField.tsx"
import type { NodeLayout } from "../card-positions.ts"
import { getScrollToIndex } from "./scroll-helpers.ts"
import { useIsColumnSelected, useIsCursorAtCard, useCursorCardIndex } from "../cursor-context.tsx"

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
        layoutLog.trace?.(
          `CardLayoutRegistrar: no registry for col=${colIndex} card=${cardIndex}`,
        )
        return
      }

      const layout: NodeLayout = {
        x: computed.x,
        y: computed.y,
        cardWidth: computed.width,
        cardHeight: computed.height,
      }

      layoutLog.trace?.(
        `CardLayoutRegistrar: col=${colIndex} card=${cardIndex} y=${computed.y} h=${computed.height}`,
      )
      registry.registerCard(colIndex, cardIndex, nodeId, layout)
    },
    [registry, colIndex, cardIndex, nodeId],
  )

  useScreenRectCallback(handleLayout)

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
  }: CardProps): React.ReactElement {
    const nodeId = card.node.id

    // Get selection state exclusively from CursorStore (self-subscription).
    // Only this card and the previously-selected card re-render on j/k.
    const isSelected = useIsCursorAtCard(colIndex, cardIndex)

    // Check if this card is in inline edit mode (for border color)
    const isEditing = useUISelector(
      (state) => state.inlineEditBlock?.nodeId === nodeId,
    )

    // Virtual body content renders borderless (inline body content)
    // This includes: cards in virtual columns OR individual virtual body cards
    if (isVirtualColumn || card.isVirtual) {
      return (
        <Box
          flexDirection="column"
          flexShrink={0}
          width={width}
          paddingLeft={1}
        >
          <CardLayoutRegistrar
            colIndex={colIndex}
            cardIndex={cardIndex}
            nodeId={nodeId}
          />
          <TreeNode
            node={card.node}
            depth={0}
            isSelected={false}
            colIndex={colIndex}
            cardIndex={cardIndex}
            subIndex={0}
            dimInactiveChildren={true}
            childCount={card.childCount}
          />
        </Box>
      )
    }

    // Border: cyan when editing (focus ring), yellow when selected, gray otherwise
    const borderColor = isEditing
      ? "cyan"
      : isSelected
        ? "yellow"
        : "blackBright"

    return (
      <Box
        flexDirection="column"
        flexShrink={0}
        width={width}
        borderStyle="round"
        borderColor={borderColor}
      >
        <CardLayoutRegistrar
          colIndex={colIndex}
          cardIndex={cardIndex}
          nodeId={nodeId}
        />
        <TreeNode
          node={card.node}
          depth={0}
          isSelected={isSelected && selectedSubIndex <= 0}
          colIndex={colIndex}
          cardIndex={cardIndex}
          subIndex={0}
          dimInactiveChildren={!isSelected}
          childCount={card.childCount}
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
      prev.cardIndex === next.cardIndex
    )
  },
)

// =============================================================================
// Column Component
// =============================================================================

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
 * Memoized Column - re-renders on j/k but Cards skip via CursorStore.
 *
 * Column subscribes to cardIndex (for VirtualList scrollTo) and column
 * selection state. Cards get their selection state from CursorStore directly,
 * so renderItem calls trigger only cheap memo checks (~0.04ms each).
 */
// oxlint-disable-next-line complexity/max-cognitive -- React component — JSX ternaries inflate score
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
  const nodeId = column.node.id

  // Subscribe to column selection + cardIndex for scroll tracking.
  // Column re-renders on j/k, but Cards use CursorStore self-subscription
  // so renderItem calls trigger only cheap memo checks (no Card re-renders).
  const columnSelected = useIsColumnSelected(colIndex)
  const isSelected = columnSelected.isSelected
  const selectionLevel = columnSelected.selectionLevel
  const cardIndex = useCursorCardIndex(colIndex)
  const scrollToIndex = getScrollToIndex(isSelected, cardIndex, column.cards.length)

  // Check if this column header is being inline-edited
  const isInlineEditing = useUISelector(
    (state) => state.inlineEditBlock?.nodeId === nodeId,
  )

  // Render name with wiki links stripped: [[target|alias]] → "alias"
  const name = renderPlain(getNodeDisplayName(repo, column.node))
  const typeSuffix = getCollapsedTypeSuffix(repo, column.node)
  const count = column.cards.length
  const wipLimit = column.wipLimit
  const isVirtual = column.isVirtual ?? false

  // Inline edit callbacks
  const handleInlineEditConfirm = useCallback(
    (newValue: string) => {
      repo.updateNode(nodeId, { content: newValue })
      setUI({ inlineEditBlock: null })
    },
    [nodeId, repo, setUI],
  )

  const handleInlineEditCancel = useCallback(() => {
    setUI({ inlineEditBlock: null })
  }, [setUI])

  // Get column's own color (not inherited) for background
  // Virtual body columns use dimmed gray styling
  const ownColor = isVirtual ? undefined : getOwnColor(column.node)
  const wipExceeded = wipLimit !== undefined && count > wipLimit

  // Build count display
  const countDisplay =
    wipLimit !== undefined ? `(${count}/${wipLimit})` : `(${count})`
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
        />
      )
    },
    [colIndex, selectedSubIndex, width, isVirtual],
  )

  const keyExtractor = useCallback((card: CardState) => card.node.id, [])

  // Get consistent bullet icon using getNodeIcon (same rules as TreeNode)
  // - Non-tasks with color: filled circle (●) in that color
  // - Non-tasks without color: small bullet (·)
  // - Virtual body columns: dimmed info icon
  const icon = isVirtual
    ? { char: "·", color: "gray" as const }
    : getNodeIcon(null, ownColor, false)
  // When column is selected, icon should be black on yellow bg
  const iconColor = isColumnSelected ? "black" : icon.color

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
      {/* Bold text, bullet uses getNodeIcon for consistent styling with TreeNode */}
      {/* Note: backgroundColor on Text (not Box) ensures fg color applies correctly */}
      <Box height={1} flexShrink={0} width={width}>
        {isInlineEditing ? (
          <Text
            bold
            color={headerStyle.color}
            backgroundColor={headerStyle.backgroundColor}
            wrap="truncate"
          >
            {" "}
            <Text color={iconColor}>{icon.char}</Text>{" "}
            <InlineEditField
              initialValue={name}
              onConfirm={handleInlineEditConfirm}
              onCancel={handleInlineEditCancel}
            />
          </Text>
        ) : (
          <Text
            bold
            color={headerStyle.color}
            backgroundColor={headerStyle.backgroundColor}
            dimColor={headerStyle.dimColor}
            wrap="truncate"
          >
            {" "}
            <Text color={iconColor}>{icon.char}</Text> {name}
            {typeSuffix ? (
              <Text
                color={isColumnSelected ? "gray" : undefined}
                dimColor={!isColumnSelected}
              >{` ${typeSuffix}`}</Text>
            ) : (
              ""
            )}
            {wipExceeded ? (
              <Text color="red">
                {` ${styledUnderline("curly", [255, 80, 80], countDisplay)}${warningIndicator}`}
              </Text>
            ) : (
              <Text
                color={isColumnSelected ? "gray" : undefined}
                dimColor={!isColumnSelected}
              >{` ${countDisplay}`}</Text>
            )}
            {collapsedIndicator}
            {/* Pad to full column width */}
            {" ".repeat(
              Math.max(
                0,
                width -
                  4 -
                  name.length -
                  countDisplay.length -
                  (typeSuffix?.length ?? 0) -
                  (collapsedIndicator?.length ?? 0),
              ),
            )}
          </Text>
        )}
      </Box>

      {isCollapsed ? (
        <Box
          flexDirection="column"
          flexGrow={1}
          minHeight={1}
          justifyContent="center"
          alignItems="center"
        >
          <Text dimColor>[collapsed - {count}]</Text>
        </Box>
      ) : column.cards.length > 0 ? (
          <VirtualList
            items={column.cards}
            height={height - 2}
            itemHeight={ESTIMATED_CARD_HEIGHT}
            scrollTo={scrollToIndex}
            overscan={OVERSCAN}
            maxRendered={MAX_RENDERED_CARDS}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
          />
      ) : (
        <Box flexDirection="column" flexGrow={1} minHeight={1}>
          <Box marginTop={1}>
            <Text dimColor>(empty)</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
})
