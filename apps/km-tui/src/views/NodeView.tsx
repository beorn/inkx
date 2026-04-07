/**
 * NodeView - Unified node rendering at different style levels.
 *
 * Consolidates duplicated rendering that was spread across:
 * - CardColumn.tsx (cards view column headers)
 * - ColumnsView.tsx (columns view column headers)
 * - shared-components.tsx (MemoizedColumnHeader for list view, NodeLine)
 * - TabsView.tsx (tab pills)
 * - TreeNode.tsx (card rendering with subitems)
 * - Board.tsx detail view mode (viewMode "detail")
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
 */
import React from "react"
import { Box, Link, Muted, Text, Small } from "@silvery/ag-react"
import { KNode } from "@km/core"
import {
  getColumnHeaderIcon,
  getNodeIcon,
  getStatusIcon,
  isSigilName,
  parseToPlainText,
  InlineText,
} from "../text/index.ts"
import { getOwnColor, getHeaderStyle } from "../board/board-pills.ts"
import { getNodeDisplayName, isNodeUntitled, getCollapsedTypeSuffix } from "../state.ts"
import type { Repo } from "../repo-context.tsx"
import type { StatusIcon } from "../text/index.ts"
import { styledUnderline } from "@silvery/ag-term/ansi"
import { extractBody } from "@km/tree"
import { DateBadge, formatSubtaskBadge, stripTaskMark } from "./tree-node-helpers.tsx"

/** Check if two names are slug-equivalent (title→slug dedup).
 * Strips sigil prefixes (@#+ ), lowercases, and normalizes separators.
 * E.g., "@Bjørn Stabell" and "@bjørn-stabell" → both slugify to "bjørn-stabell". */
function slugsMatch(a: string, b: string): boolean {
  const slugify = (s: string) =>
    s
      .replace(/^[@#\+]/, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
  return slugify(a) === slugify(b)
}

// =============================================================================
// Types
// =============================================================================

export interface ColumnHeaderStyle {
  color: string | undefined
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
  const iconColor = isColumnSelected ? "$selection" : icon.color
  const wipExceeded = wipLimit !== undefined && cardCount > wipLimit

  // Build count display
  const countDisplay = wipLimit !== undefined ? `${cardCount}/${wipLimit}` : `${cardCount}`
  const warningIndicator = wipExceeded ? " \u26A0" : ""
  const collapsedIndicator = isCollapsed ? " \u25B8" : ""

  return (
    <Box flexDirection="column" width={width} userSelect="none" data-view="column-header">
      {/* Blank line above (for list view, not first header) */}
      {showTopSpacer && (
        <Box height={1}>
          <Text> </Text>
        </Box>
      )}
      {/* Header row — paddingLeft aligns icon with card content (cards have 1-char border) */}
      <Box height={1} flexShrink={0} width={width} flexDirection="row" backgroundColor={headerStyle.backgroundColor}>
        <Box width={1} flexShrink={0} />
        <Box flexGrow={1} flexShrink={1} flexDirection="row">
          {children ? (
            // Custom content (e.g., inline edit field)
            <Text bold color={headerStyle.color} wrap="truncate">
              <Text color={iconColor}>{icon.char}</Text> {children}
            </Text>
          ) : (
            <>
              <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={2}>
                <Text bold={!isVirtual} color={headerStyle.color} dimColor={headerStyle.dimColor} wrap="truncate">
                  <Text color={iconColor}>{icon.char}</Text>{" "}
                  <Text color={isColumnSelected ? undefined : ownColor}>
                    {untitled ? <Text color={"$warning"}>{displayName}</Text> : displayName}
                    {!isVirtual && isSigilName(node.name) && node.name && !slugsMatch(node.name, displayName) && (
                      <>
                        {" "}
                        <Text dimColor>{node.name}</Text>
                      </>
                    )}
                  </Text>
                  {hasBody && !isVirtual && <Text dimColor>{" ···"}</Text>}
                  {typeSuffix ? (
                    <Text
                      color={isColumnSelected ? "$muted" : undefined}
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
                      <Text
                        color={"$error"}
                      >{` ${styledUnderline("curly", [255, 80, 80], countDisplay)}${warningIndicator}`}</Text>
                    ) : (
                      <Text color={isColumnSelected ? headerStyle.color : "$muted"}>{` ${countDisplay}`}</Text>
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
          <Text color={isColumnSelected ? "$selection-bg" : "$disabled-fg"}>{"\u2500".repeat(Math.max(0, width))}</Text>
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
  /** Override display name (pre-computed, skips stripTaskMark) */
  displayName?: string
  /** Indentation level (rendered as 2-space increments before icon) */
  indent?: number
}

/**
 * Compact one-line node display: [indent] icon + title (truncated).
 *
 * Used inside cards for subitems, detail panes for child listings,
 * and folder outlines. Pure presentational — no hooks.
 * Status-aware: dims done/dropped items.
 */
export function NodeLineView({
  node,
  isSelected = false,
  ancestorDone = false,
  width,
  displayName,
  indent = 0,
}: NodeLineViewProps): React.ReactElement {
  const nodeIsTask = KNode.isTask(node)
  const isDoneOrDropped = node.item?.task?.status === "done" || node.item?.task?.status === "dropped"
  const shouldDim = isDoneOrDropped || ancestorDone

  // Icon: task status icon for tasks, type icon for non-tasks
  const icon = nodeIsTask
    ? getStatusIcon(node.item?.task?.status ?? "todo")
    : getNodeIcon(node.item?.task?.status, undefined, node.item?.task?.marker !== undefined)

  // Title: use displayName override or derive from content
  const titleText =
    displayName ??
    (() => {
      const rawContent = node.content ?? ""
      return nodeIsTask ? stripTaskMark(rawContent) : rawContent
    })()

  const textColor = isSelected ? "$selection" : undefined
  const bgColor = isSelected ? "$selection-bg" : undefined
  const iconColor = isSelected ? "$selection" : isDoneOrDropped ? undefined : icon.color
  const indentStr = indent > 0 ? "  ".repeat(indent) : ""

  return (
    <Box width={width} height={1} backgroundColor={bgColor} paddingRight={2}>
      <Text color={textColor} dimColor={shouldDim} strikethrough={false} wrap="truncate">
        {indentStr}
        <Text color={iconColor}>{icon.char}</Text> <InlineText text={titleText} context={{ hideFields: true }} />
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
  /** Whether the node has unresolved dependencies (shows "blocked" indicator) */
  isBlocked?: boolean
  /** Parent context string for symlinked tasks (shown above title, dimmed italic) */
  parentContext?: string | null
  /** Parent node ID for navigation links (enables Cmd+click on parent context) */
  parentNodeId?: string | null
}

/**
 * Card-style node display: icon + title + date badge + N subitems (as lines) + overflow count.
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
  isBlocked = false,
  parentContext,
  parentNodeId,
}: NodeCardViewProps): React.ReactElement {
  const nodeIsTask = KNode.isTask(node)
  const isDoneOrDropped = node.item?.task?.status === "done" || node.item?.task?.status === "dropped"
  const shouldDim = isDoneOrDropped || ancestorDone

  // Icon: task status icon for tasks, type icon for non-tasks
  const icon = nodeIsTask
    ? getStatusIcon(node.item?.task?.status ?? "todo")
    : getNodeIcon(node.item?.task?.status, undefined, node.item?.task?.marker !== undefined)

  // Title
  const rawContent = node.content ?? ""
  const displayContent = nodeIsTask ? stripTaskMark(rawContent) : rawContent

  const textColor = isSelected ? "$selection" : undefined
  const bgColor = isSelected ? "$selection-bg" : undefined
  const iconColor = isSelected ? "$selection" : isDoneOrDropped ? undefined : icon.color
  const shouldStripColor = isSelected || isDoneOrDropped

  // Subtask progress badge (e.g., "3/7") — shows done/total for task children
  const subtaskBadge = formatSubtaskBadge(children)

  // Date badge — rendered as React component
  const hasDateBadge = !isDoneOrDropped && !!(node.priority || node.due_at || node.start_at || node.rrule)

  // Show all children as subitems (both body and structural)
  const visibleChildren = children.slice(0, maxSubitems)
  const overflowCount = children.length - visibleChildren.length

  // Body indicator: show ··· only when body children exist but are hidden by overflow.
  // When subitems are visible, body content is already displayed inline.
  const hasBody = extractBody(children).body.length > 0 && children.length > maxSubitems

  return (
    <Box flexDirection="column" width={width}>
      {/* Parent context for symlinked tasks — Cmd+click navigable when parentNodeId is set */}
      {parentContext && parentNodeId && (
        <Link href={`km://node/${parentNodeId}`} color="$muted" underline={false}>
          <Text italic wrap="truncate">
            {"  "}
            {parentContext}
          </Text>
        </Link>
      )}
      {parentContext && !parentNodeId && (
        <Text dimColor italic wrap="truncate">
          {"  "}
          {parentContext}
        </Text>
      )}
      {/* Title line */}
      <Box height={1} backgroundColor={bgColor} flexDirection="row">
        <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={2}>
          <Text bold color={textColor} dimColor={shouldDim} wrap="truncate">
            <Text color={iconColor}>{icon.char}</Text>{" "}
            <InlineText
              text={displayContent}
              context={{ colorOverride: shouldStripColor ? null : undefined, hideFields: true }}
            />
            {subtaskBadge && <Text color={isSelected ? "$selection" : "$muted"}>{` ${subtaskBadge}`}</Text>}
            {hasBody && <Text dimColor>{" ···"}</Text>}
          </Text>
        </Box>
        {isBlocked && (
          <Box flexShrink={0}>
            <Text color={isSelected ? "$selection" : "$error"}>{" blocked"}</Text>
          </Box>
        )}
        {hasDateBadge && (
          <Box flexShrink={0}>
            <Text color={textColor} wrap="truncate">
              {" "}
              <DateBadge node={node} stripColor={shouldStripColor} />
            </Text>
          </Box>
        )}
      </Box>
      {/* Subitems */}
      {visibleChildren.map((child, i) => (
        <Box key={`${child.id}-${i}`} paddingLeft={1}>
          <NodeLineView node={child} ancestorDone={shouldDim} />
        </Box>
      ))}
      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <Box paddingLeft={1}>
          <Small>+{overflowCount} more</Small>
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
  const textColor = isSelected ? "$selection" : undefined
  const bgColor = isSelected ? "$selection-bg" : undefined

  return (
    <Box flexDirection="column" width={width}>
      <Box height={1} backgroundColor={bgColor} flexDirection="row">
        <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={2}>
          <Text bold color={textColor} wrap="truncate">
            {"§ "}
            {displayName}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text color={isSelected ? "$selection" : "$muted"}>{` ${count}`}</Text>
        </Box>
      </Box>
      {/* Separator line */}
      <Box height={1} width={width}>
        <Text dimColor={!isSelected} color={isSelected ? "$selection-bg" : undefined}>
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
  /** Whether to dim inactive (non-active, non-selected) tabs */
  dimInactive?: boolean
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
  dimInactive = false,
}: NodeTabViewProps): React.ReactElement {
  // Truncate long names
  const maxNameWidth = 20
  const truncatedName =
    displayName.length > maxNameWidth ? displayName.slice(0, maxNameWidth - 1) + "\u2026" : displayName
  const countStr = ` (${count})`

  const textColor = isSelected ? "$selection" : isActive ? "$selection-bg" : "$fg"

  return (
    <Box backgroundColor={isSelected ? "$selection-bg" : undefined}>
      <Text bold color={textColor} dimColor={!isActive && !isSelected && dimInactive}>
        {" "}
        {untitled ? (
          <Text dimColor color={"$muted"}>
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
 * Detail-style node display: title + metadata + body + children (as lines) + backlinks.
 *
 * Used in the side pane (detail view mode). Provides layout for the unified
 * board pane with viewMode "detail".
 */
export function NodeDetailView({
  node,
  children,
  backlinks = [],
  width,
  height,
  isSelected: _isSelected = false,
}: NodeDetailViewProps): React.ReactElement {
  const nodeIsTask = KNode.isTask(node)
  const rawContent = node.content ?? ""
  const displayContent = nodeIsTask ? stripTaskMark(rawContent) : rawContent

  const statusIcon = nodeIsTask ? getStatusIcon(node.item?.task?.status ?? "todo") : null
  const contentWidth = Math.max(8, width - 4)

  // Separate body from structural children
  const { body: bodyChildren, items: structuralChildren } = extractBody(children)
  const maxCards = Math.max(1, height - 10) // Reserve space for title, metadata, separators
  const visibleCards = structuralChildren.slice(0, maxCards)
  const maxBacklinks = 5

  // Metadata fields
  const metadataRows: { label: string; value: string }[] = []
  if (node.item?.task?.status) metadataRows.push({ label: "Status", value: node.item?.task?.status })
  if (node.due_at) metadataRows.push({ label: "Due", value: node.due_at })
  if (node.start_at) metadataRows.push({ label: "Start", value: node.start_at })
  if (node.assigned_to) metadataRows.push({ label: "Assigned", value: node.assigned_to })
  if (node.priority) metadataRows.push({ label: "Priority", value: `P${node.priority}` })
  if (node.rrule) metadataRows.push({ label: "Recurrence", value: node.rrule })

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={"$selection-bg"}
      backgroundColor={"$popover-bg"}
    >
      {/* Title header — yellow bg */}
      <Box flexDirection="column" width={width - 2} backgroundColor={"$selection-bg"} paddingX={1}>
        <Text bold color={"$selection"} wrap="wrap">
          {statusIcon && <Text>{statusIcon.char} </Text>}
          <InlineText text={displayContent} context={{ colorOverride: null, hideFields: true }} />
        </Text>
      </Box>

      {/* Separator */}
      <Text dimColor>{" " + "\u2500".repeat(contentWidth) + " "}</Text>

      {/* Scrollable content */}
      <Box flexDirection="column" overflow="hidden" flexGrow={1} paddingX={1}>
        {/* Metadata fields */}
        {metadataRows.length > 0 && (
          <Box flexDirection="column">
            {metadataRows.map((row) => (
              <Box key={row.label} flexDirection="row">
                <Box width={10} flexShrink={0}>
                  <Muted>{row.label}</Muted>
                </Box>
                <Text>{row.value}</Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Separator between metadata and content */}
        {metadataRows.length > 0 && <Text dimColor>{"\u2500".repeat(contentWidth)}</Text>}

        {/* Body content */}
        {bodyChildren.map((child, i) => (
          <React.Fragment key={`${child.id}-${i}`}>
            {i > 0 && <Text> </Text>}
            <Text wrap="wrap">
              <InlineText text={child.content ?? ""} />
            </Text>
          </React.Fragment>
        ))}

        {/* Children as lines */}
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

        {bodyChildren.length === 0 && structuralChildren.length === 0 && <Small>(empty)</Small>}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              Backlinks ({backlinks.length})
            </Text>
            {backlinks.slice(0, maxBacklinks).map((bl) => (
              <Text key={bl.id} wrap="truncate">
                {"  "}
                <Text bold>
                  <InlineText text={bl.content ?? ""} context={{ hideFields: true }} />
                </Text>
              </Text>
            ))}
            {backlinks.length > maxBacklinks && <Small> +{backlinks.length - maxBacklinks} more</Small>}
          </Box>
        )}
      </Box>
    </Box>
  )
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
} {
  const isVirtual = opts.isVirtual ?? false
  const displayName = parseToPlainText(getNodeDisplayName(repo, node))
  const untitled = isNodeUntitled(repo, node)
  const ownColor = isVirtual ? undefined : getOwnColor(node)
  const typeSuffix = getCollapsedTypeSuffix(repo, node) || undefined

  const headerStyle = opts.isInlineEditing
    ? {
        color: "$focusborder",
        backgroundColor: undefined as string | undefined,
        dimColor: false,
      }
    : getHeaderStyle(ownColor, opts.isSelected, opts.isColumnSelected)

  // Virtual body columns: dim header unless cursor is on column header
  if (isVirtual && !opts.isColumnSelected) headerStyle.dimColor = true

  const icon = getColumnHeaderIcon(node, opts.iconStyle, isVirtual, ownColor)

  return { displayName, untitled, ownColor, headerStyle, icon, typeSuffix }
}
