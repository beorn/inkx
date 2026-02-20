/**
 * NodeView - Unified node rendering at different style levels.
 *
 * Consolidates duplicated rendering that was spread across:
 * - CardColumn.tsx (cards view column headers)
 * - ColumnsView.tsx (columns view column headers)
 * - shared-components.tsx (MemoizedColumnHeader for list view, NodeLine)
 * - TabsView.tsx (tab pills)
 * - TreeNode.tsx (card rendering with subitems)
 * - DetailPane.tsx (detail view)
 *
 * ## Style Levels
 *
 * - **board**: Full column header row with icon, title, count, separator.
 *   Supports selection highlighting, virtual/body column dimming, WIP limits,
 *   collapsed indicators, type suffixes, and sigil name display.
 * - **line**: Icon + title (1 line, truncated). Used inside cards and detail panes.
 * - **card**: Icon + title + badges + N subitems (as lines) + overflow count.
 * - **column**: Section header — section name + count.
 * - **tab**: Title pill for tab bar.
 * - **detail**: Metadata table + body + children (as cards) + backlinks.
 *
 * ## Design
 *
 * Pure presentational component — no hooks for cursor/selection state.
 * Callers pass computed style props (headerStyle, isColumnSelected, etc.).
 * This keeps NodeView testable and avoids coupling to cursor architecture.
 *
 * NODE MODEL V2: Receives KNode directly. No ColumnState/CardState wrappers.
 */
import React from "react"
import { Box, Text } from "inkx"
import type { KNode } from "@km/core"
import { isTask } from "@km/core"
import { getColumnHeaderIcon, getNodeIcon, getStatusIcon, isSigilName, renderPlain, renderRich } from "../text/index.ts"
import { getOwnColor, getHeaderStyle } from "../board-pills.ts"
import { getNodeDisplayName, isNodeUntitled, getCollapsedTypeSuffix } from "../state.ts"
import type { Repo } from "../repo-context.tsx"
import type { StatusIcon } from "../text/index.ts"
import { styledUnderline } from "chalkx"
import { extractBody } from "@km/tree"
import { stripForDisplay } from "@km/tree"

// =============================================================================
// Types
// =============================================================================

export interface ColumnHeaderStyle {
  color: string
  backgroundColor: string | undefined
  dimColor: boolean
}

export interface ColumnHeaderProps {
  /** The KNode representing the column */
  node: KNode
  /** Pre-computed display name (plain text, wiki-links stripped) */
  displayName: string
  /** Whether the node has no meaningful title */
  untitled: boolean
  /** Node's own color (not inherited) */
  ownColor: string | undefined
  /** Pre-computed header style (color, bg, dim) */
  headerStyle: ColumnHeaderStyle
  /** Icon to display */
  icon: StatusIcon
  /** Number of cards in this column */
  cardCount: number
  /** Available width in columns */
  width: number
  /** Whether this column header is the active selection target */
  isColumnSelected: boolean
  /** Whether the cursor is anywhere in this column */
  isSelected?: boolean
  /** Whether this is a virtual body column */
  isVirtual?: boolean
  /** WIP limit (undefined = no limit) */
  wipLimit?: number
  /** Collapsed indicator suffix */
  isCollapsed?: boolean
  /** Type suffix for collapsed nodes (e.g., " (file)") */
  typeSuffix?: string
  /** Whether to show a separator line below the header */
  showSeparator?: boolean
  /** Whether to show a blank line above the header */
  showTopSpacer?: boolean
  /** Whether the column node has body content (non-structural children) */
  hasBody?: boolean
  /** Override content (for inline editing) */
  children?: React.ReactNode
}

// =============================================================================
// ColumnHeader Component
// =============================================================================

/**
 * Renders a column header row: icon + title + sigil suffix + count + separator.
 *
 * Pure presentational — all state (selection, color, style) is pre-computed
 * by the caller. This avoids duplicating cursor/selection hooks across views.
 */
export function ColumnHeader({
  node,
  displayName,
  untitled,
  ownColor,
  headerStyle,
  icon,
  cardCount,
  width,
  isColumnSelected,
  isSelected: _isSelected,
  isVirtual = false,
  wipLimit,
  isCollapsed = false,
  typeSuffix,
  showSeparator = true,
  showTopSpacer = false,
  hasBody = false,
  children,
}: ColumnHeaderProps): React.ReactElement {
  const iconColor = isColumnSelected ? "black" : icon.color
  const wipExceeded = wipLimit !== undefined && cardCount > wipLimit

  // Build count display
  const countDisplay = wipLimit !== undefined ? `${cardCount}/${wipLimit}` : `${cardCount}`
  const warningIndicator = wipExceeded ? " \u26A0" : ""
  const collapsedIndicator = isCollapsed ? " \u25B8" : ""

  return (
    <Box flexDirection="column" width={width}>
      {/* Blank line above (for list view, not first header) */}
      {showTopSpacer && (
        <Box height={1}>
          <Text> </Text>
        </Box>
      )}
      {/* Header row — paddingLeft aligns icon with card content (cards have 1-char border) */}
      <Box height={1} flexShrink={0} width={width} flexDirection="row">
        <Box width={1} flexShrink={0} />
        <Box
          flexGrow={1}
          flexShrink={1}
          flexDirection="row"
          backgroundColor={headerStyle.backgroundColor}
        >
          {children ? (
            // Custom content (e.g., inline edit field)
            <Text bold color={headerStyle.color} wrap="truncate">
              <Text color={iconColor}>{icon.char}</Text>{" "}
              {children}
            </Text>
          ) : (
            <>
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <Text bold={!isVirtual} color={headerStyle.color} dimColor={headerStyle.dimColor} wrap="truncate">
                  <Text color={iconColor}>{icon.char}</Text>{" "}
                  <Text color={isColumnSelected ? undefined : ownColor}>
                    {untitled ? (
                      <Text dimColor color="gray">
                        {displayName}
                      </Text>
                    ) : (
                      displayName
                    )}
                    {!isVirtual && isSigilName(node.name) && node.name !== displayName && (
                      <>
                        {" "}
                        <Text dimColor>{node.name}</Text>
                      </>
                    )}
                  </Text>
                  {hasBody && !isVirtual && <Text dimColor>{" ···"}</Text>}
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
              {wipLimit !== undefined && (
                <Box flexShrink={0}>
                  <Text color={headerStyle.color} dimColor={headerStyle.dimColor}>
                    {wipExceeded ? (
                      <Text color="red">{` ${styledUnderline("curly", [255, 80, 80], countDisplay)}${warningIndicator}`}</Text>
                    ) : (
                      <Text color={isColumnSelected ? headerStyle.color : "gray"}>{` ${countDisplay}`}</Text>
                    )}
                  </Text>
                </Box>
              )}
            </>
          )}
        </Box>
        <Box width={1} flexShrink={0} />
      </Box>
      {/* Separator line between header and cards */}
      {showSeparator && (
        <Box height={1} flexShrink={0} width={width}>
          <Text color={isColumnSelected ? "yellow" : undefined} dimColor={!isColumnSelected}>
            {"\u2500".repeat(Math.max(0, width))}
          </Text>
        </Box>
      )}
    </Box>
  )
}

// =============================================================================
// NodeLine — line style (icon + title, 1 line, truncated)
// =============================================================================

export interface NodeLineViewProps {
  /** The KNode to display */
  node: KNode
  /** Whether this line is the selected/highlighted item */
  isSelected?: boolean
  /** Whether ancestor is done/dropped (dims the entire line) */
  ancestorDone?: boolean
  /** Width available for rendering */
  width?: number
}

/**
 * Compact one-line node display: icon + title (truncated).
 *
 * Used inside cards for subitems and in detail panes for child listings.
 * Pure presentational — no hooks. Status-aware: dims done/dropped items.
 */
export function NodeLineView({
  node,
  isSelected = false,
  ancestorDone = false,
  width,
}: NodeLineViewProps): React.ReactElement {
  const nodeIsTask = isTask(node)
  const isDoneOrDropped = node.task_status === "done" || node.task_status === "dropped"
  const shouldDim = isDoneOrDropped || ancestorDone

  // Icon: task status icon for tasks, type icon for non-tasks
  const icon = nodeIsTask
    ? getStatusIcon(node.task_status ?? "todo")
    : getNodeIcon(node.task_status, undefined, node.task_marker !== undefined)

  // Title: strip metadata, render rich text
  const rawContent = node.content ? stripForDisplay(node.content) : ""
  const displayContent = nodeIsTask ? stripTaskMarker(rawContent) : rawContent
  const title = renderRich(displayContent)

  const textColor = isSelected ? "black" : undefined
  const bgColor = isSelected ? "yellow" : undefined
  const iconColor = isSelected ? "black" : (isDoneOrDropped ? undefined : icon.color)

  return (
    <Box width={width} height={1} backgroundColor={bgColor}>
      <Text
        color={textColor}
        dimColor={shouldDim}
        strikethrough={false}
        wrap="truncate"
      >
        <Text color={iconColor}>{icon.char}</Text>{" "}
        {title}
      </Text>
    </Box>
  )
}

// =============================================================================
// NodeCardView — card style (icon + title + badges + subitems + overflow)
// =============================================================================

export interface NodeCardViewProps {
  /** The KNode to display */
  node: KNode
  /** Children of this node (subitems to show) */
  children: KNode[]
  /** Whether this card is selected */
  isSelected?: boolean
  /** Whether ancestor is done/dropped */
  ancestorDone?: boolean
  /** Max number of subitems to show before overflow */
  maxSubitems?: number
  /** Width available for rendering */
  width?: number
}

/**
 * Card-style node display: icon + title + N subitems (as lines) + overflow count.
 *
 * Used in board columns. Cross-cutting: isDone/isDropped dims entire card.
 * Pure presentational — no hooks.
 */
export function NodeCardView({
  node,
  children,
  isSelected = false,
  ancestorDone = false,
  maxSubitems = 5,
  width,
}: NodeCardViewProps): React.ReactElement {
  const nodeIsTask = isTask(node)
  const isDoneOrDropped = node.task_status === "done" || node.task_status === "dropped"
  const shouldDim = isDoneOrDropped || ancestorDone

  // Icon: task status icon for tasks, type icon for non-tasks
  const icon = nodeIsTask
    ? getStatusIcon(node.task_status ?? "todo")
    : getNodeIcon(node.task_status, undefined, node.task_marker !== undefined)

  // Title
  const rawContent = node.content ? stripForDisplay(node.content) : ""
  const displayContent = nodeIsTask ? stripTaskMarker(rawContent) : rawContent
  const title = renderRich(displayContent)

  const textColor = isSelected ? "black" : undefined
  const bgColor = isSelected ? "yellow" : undefined
  const iconColor = isSelected ? "black" : (isDoneOrDropped ? undefined : icon.color)

  // Body indicator: show ··· when node has body children (paragraphs, quotes, code blocks, etc.)
  const hasBody = extractBody(children).body.length > 0

  // Show all children as subitems (both body and structural)
  const visibleChildren = children.slice(0, maxSubitems)
  const overflowCount = children.length - visibleChildren.length

  return (
    <Box flexDirection="column" width={width}>
      {/* Title line */}
      <Box height={1} backgroundColor={bgColor}>
        <Text
          bold
          color={textColor}
          dimColor={shouldDim}
          wrap="truncate"
        >
          <Text color={iconColor}>{icon.char}</Text>{" "}
          {title}
          {hasBody && <Text dimColor>{" ···"}</Text>}
        </Text>
      </Box>
      {/* Subitems */}
      {visibleChildren.map((child, i) => (
        <Box key={`${child.id}-${i}`} paddingLeft={1}>
          <NodeLineView
            node={child}
            ancestorDone={shouldDim}
          />
        </Box>
      ))}
      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <Box paddingLeft={1}>
          <Text dimColor>+{overflowCount} more</Text>
        </Box>
      )}
    </Box>
  )
}

// =============================================================================
// NodeColumnView — column/section header style (section name + count)
// =============================================================================

export interface NodeColumnViewProps {
  /** The KNode representing the section */
  node: KNode
  /** Display name for the section */
  displayName: string
  /** Number of items in this section */
  count: number
  /** Whether this section header is selected */
  isSelected?: boolean
  /** Available width */
  width?: number
}

/**
 * Section header display: section name + item count.
 *
 * Used in columns view (list of sections). Shows a dimmed count
 * and separator line below.
 */
export function NodeColumnView({
  node: _node,
  displayName,
  count,
  isSelected = false,
  width,
}: NodeColumnViewProps): React.ReactElement {
  const textColor = isSelected ? "black" : undefined
  const bgColor = isSelected ? "yellow" : undefined

  return (
    <Box flexDirection="column" width={width}>
      <Box height={1} backgroundColor={bgColor} flexDirection="row">
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text bold color={textColor} wrap="truncate">
            {"§ "}
            {displayName}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text color={isSelected ? "black" : "gray"}>{` ${count}`}</Text>
        </Box>
      </Box>
      {/* Separator line */}
      <Box height={1} width={width}>
        <Text dimColor={!isSelected} color={isSelected ? "yellow" : undefined}>
          {"\u2500".repeat(Math.max(0, width ?? 40))}
        </Text>
      </Box>
    </Box>
  )
}

// =============================================================================
// NodeTabView — tab style (title pill for tab bar)
// =============================================================================

export interface NodeTabViewProps {
  /** The KNode representing the tab */
  node: KNode
  /** Display name for the tab */
  displayName: string
  /** Whether this tab is the active tab */
  isActive?: boolean
  /** Whether this tab is selected (cursor on tab) */
  isSelected?: boolean
  /** Whether this node has no meaningful title */
  untitled?: boolean
  /** Number of items in the tab's column */
  count: number
}

/**
 * Tab pill display: title + count in parentheses.
 *
 * Used in tab bar (TabsView). Active tab is bold/highlighted,
 * selected tab gets yellow background. Untitled tabs show dimmed gray.
 */
export function NodeTabView({
  node: _node,
  displayName,
  isActive = false,
  isSelected = false,
  untitled = false,
  count,
}: NodeTabViewProps): React.ReactElement {
  // Truncate long names
  const maxNameWidth = 20
  const truncatedName =
    displayName.length > maxNameWidth ? displayName.slice(0, maxNameWidth - 1) + "\u2026" : displayName
  const countStr = ` (${count})`

  const textColor = isSelected ? "black" : isActive ? "yellow" : "white"

  return (
    <Box backgroundColor={isSelected ? "yellow" : undefined}>
      <Text bold color={textColor} dimColor={!isActive && !isSelected}>
        {" "}
        {untitled ? (
          <Text dimColor color="gray">
            {truncatedName}
          </Text>
        ) : (
          truncatedName
        )}
        <Text dimColor={!isSelected}>{countStr}</Text>{" "}
      </Text>
    </Box>
  )
}

// =============================================================================
// NodeDetailView — detail style (metadata + body + children + backlinks)
// =============================================================================

export interface NodeDetailViewProps {
  /** The KNode to display */
  node: KNode
  /** Children of this node */
  children: KNode[]
  /** Backlink nodes referencing this node */
  backlinks?: KNode[]
  /** Available width */
  width: number
  /** Available height */
  height: number
  /** Whether this node is selected */
  isSelected?: boolean
}

/**
 * Detail-style node display: title + body + children (as cards) + backlinks.
 *
 * Used in the side pane (detail view). This is a stub that will eventually
 * replace DetailPane.tsx — for now, it provides the basic layout.
 */
export function NodeDetailView({
  node,
  children,
  backlinks = [],
  width,
  height,
  isSelected: _isSelected = false,
}: NodeDetailViewProps): React.ReactElement {
  const nodeIsTask = isTask(node)
  const rawContent = node.content ? stripForDisplay(node.content) : ""
  const displayContent = nodeIsTask ? stripTaskMarker(rawContent) : rawContent
  const title = renderRich(displayContent)

  const statusIcon = nodeIsTask ? getStatusIcon(node.task_status ?? "todo") : null
  const contentWidth = Math.max(8, width - 4)

  // Separate body from structural children
  const { body: bodyChildren, items: structuralChildren } = extractBody(children)
  const maxCards = Math.max(1, height - 10) // Reserve space for title, metadata, separators
  const visibleCards = structuralChildren.slice(0, maxCards)
  const maxBacklinks = 5

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="yellow"
      backgroundColor="black"
    >
      {/* Title header — yellow bg */}
      <Box flexDirection="column" width={width - 2} backgroundColor="yellow" paddingX={1}>
        <Text bold color="black" wrap="wrap">
          {statusIcon && <Text>{statusIcon.char} </Text>}
          {title}
        </Text>
      </Box>

      {/* Separator */}
      <Text dimColor>{" " + "\u2500".repeat(contentWidth) + " "}</Text>

      {/* Scrollable content */}
      <Box flexDirection="column" overflow="hidden" flexGrow={1} paddingX={1}>
        {/* Body content */}
        {bodyChildren.map((child, i) => (
          <React.Fragment key={`${child.id}-${i}`}>
            {i > 0 && <Text>{" "}</Text>}
            <Text wrap="wrap">{renderRich(child.content ?? "")}</Text>
          </React.Fragment>
        ))}

        {/* Children as cards */}
        {visibleCards.length > 0 && (
          <Box flexDirection="column" marginTop={bodyChildren.length > 0 ? 1 : 0}>
            {visibleCards.map((child, i) => (
              <Box key={`${child.id}-${i}`} flexDirection="column">
                {i > 0 && <Text dimColor>{"\u2500".repeat(contentWidth)}</Text>}
                <NodeLineView node={child} />
              </Box>
            ))}
          </Box>
        )}

        {bodyChildren.length === 0 && structuralChildren.length === 0 && (
          <Text dimColor>(empty)</Text>
        )}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Backlinks ({backlinks.length})
            </Text>
            {backlinks.slice(0, maxBacklinks).map((bl) => (
              <Text key={bl.id} wrap="truncate">
                {"  "}
                <Text bold>{renderRich(bl.content ? stripForDisplay(bl.content) : "")}</Text>
              </Text>
            ))}
            {backlinks.length > maxBacklinks && (
              <Text dimColor>  +{backlinks.length - maxBacklinks} more</Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// =============================================================================
// Helper: Strip task marker from content
// =============================================================================

/** Strip markdown task marker (e.g., [x], [ ]) from beginning of text */
function stripTaskMarker(text: string): string {
  return text.replace(/^\[.\]\s*/, "")
}

// =============================================================================
// Helper: Derive ColumnHeader props from a KNode + repo
// =============================================================================

/**
 * Derive all ColumnHeader presentation props from a KNode and repo.
 *
 * Convenience function that calls getNodeDisplayName, isNodeUntitled,
 * getOwnColor, getHeaderStyle, getColumnHeaderIcon, etc. — all the
 * derivations that were duplicated across CardColumn, ColumnsView, and
 * MemoizedColumnHeader.
 *
 * Note: This calls repo methods, so it should be called inside a React
 * component (where repo is available via useRepo hook).
 */
export function deriveColumnHeaderProps(
  repo: Repo,
  node: KNode,
  opts: {
    iconStyle: string
    isSelected: boolean
    isColumnSelected: boolean
    isVirtual?: boolean
    isInlineEditing?: boolean
  },
): {
  displayName: string
  untitled: boolean
  ownColor: string | undefined
  headerStyle: ColumnHeaderStyle
  icon: StatusIcon
  typeSuffix: string | undefined
  hasBody: boolean
} {
  const isVirtual = opts.isVirtual ?? false
  const displayName = renderPlain(getNodeDisplayName(repo, node))
  const untitled = isNodeUntitled(repo, node)
  const ownColor = isVirtual ? undefined : getOwnColor(node)
  const typeSuffix = getCollapsedTypeSuffix(repo, node) || undefined

  const headerStyle = opts.isInlineEditing
    ? {
        color: "cyan",
        backgroundColor: undefined as string | undefined,
        dimColor: false,
      }
    : getHeaderStyle(ownColor, opts.isSelected, opts.isColumnSelected)

  // Virtual body columns: dim header unless cursor is on column header
  if (isVirtual && !opts.isColumnSelected) headerStyle.dimColor = true

  const icon = getColumnHeaderIcon(node, opts.iconStyle, isVirtual, ownColor)

  // Check if the column node has body content (non-structural children like p, quote, etc.)
  const hasBody = !isVirtual && extractBody(repo.getChildren(node.id)).body.length > 0

  return { displayName, untitled, ownColor, headerStyle, icon, typeSuffix, hasBody }
}
