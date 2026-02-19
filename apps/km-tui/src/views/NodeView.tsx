/**
 * NodeView - Unified node rendering at different style levels.
 *
 * Consolidates duplicated column header rendering that was spread across:
 * - CardColumn.tsx (cards view column headers)
 * - ColumnsView.tsx (columns view column headers)
 * - shared-components.tsx (MemoizedColumnHeader for list view)
 *
 * ## Style Levels
 *
 * - **column**: Full column header row with icon, title, count, separator.
 *   Supports selection highlighting, virtual/body column dimming, WIP limits,
 *   collapsed indicators, type suffixes, and sigil name display.
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
import { getColumnHeaderIcon, isSigilName, renderPlain } from "../text/index.ts"
import { getOwnColor, getHeaderStyle } from "../board-pills.ts"
import { getNodeDisplayName, isNodeUntitled, getCollapsedTypeSuffix } from "../state.ts"
import type { Repo } from "../repo-context.tsx"
import type { StatusIcon } from "../text/index.ts"
import { styledUnderline } from "chalkx"
import { extractBody } from "@km/tree"

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
