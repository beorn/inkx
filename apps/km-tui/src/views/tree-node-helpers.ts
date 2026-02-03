/**
 * Helper functions for TreeNode component
 *
 * Pure functions extracted from TreeNode for testability and clarity.
 */

import type { KNode } from "@km/core"
import { extractTitleTaskMark } from "@km/markdown"
import {
  getFoldMarker,
  getStatusIcon,
  styledUnderline,
  type StatusIcon,
} from "../text/index.ts"
import {
  formatBoardPills,
  getOwnColor,
  type BoardPill,
} from "../board-pills.ts"

// =============================================================================
// Content Helpers
// =============================================================================

/**
 * Strip markdown task mark from the beginning of text.
 * Uses the shared extractTitleTaskMark from @km/markdown.
 *
 * Used to remove [x], [ ], [/], etc. from displayed content since
 * the task status is shown via the icon instead.
 *
 * @example
 * stripTaskMark("[x] Done task") => "Done task"
 * stripTaskMark("[ ] Todo task") => "Todo task"
 * stripTaskMark("Regular text") => "Regular text"
 */
export function stripTaskMark(text: string): string {
  return extractTitleTaskMark(text).cleanText
}

// =============================================================================
// Constants
// =============================================================================

/**
 * TreeNode display variants:
 * - oneliner: Title + parent context inline, truncated to one line
 * - multiline: Parent context above title, content can wrap multiple lines
 */
export const VARIANT_CONFIG = {
  // Limit children in oneliner to prevent performance issues with large nodes
  // (e.g., People folder with 3k+ children creating 40k+ inkx nodes)
  oneliner: { maxChildren: 20, showInfoColumns: true },
  multiline: { maxChildren: 8, showInfoColumns: false },
} as const

// =============================================================================
// Style Helpers
// =============================================================================

export interface NodeStyleResult {
  backgroundColor: string | undefined
  textColor: string | undefined
  shouldDim: boolean
  shouldStrikethrough: boolean
  /** Task status icon to prepend to content (null for non-tasks) */
  taskStatusIcon: StatusIcon | null
  /** Node's own color (for fold marker) */
  ownColor: string | undefined
}

/**
 * Compute all styling for a node in one place.
 * Handles selection, own color, task status icons, dim state, and strikethrough.
 *
 * New cards style:
 * - Fold marker (●/•/·) is separate and handled by buildPrefix
 * - Task status icon (▢/◧/■/▣) is prepended to content
 */
export function getNodeStyle(
  node: KNode,
  isSelected: boolean,
  isMultiSelected: boolean,
  dimInactiveChildren: boolean,
  depth: number,
): NodeStyleResult {
  // A node is a task if it has task_status set, regardless of structural type
  const isTask = node.task_status != null
  const ownColor = getOwnColor(node)

  // Task status icon: prepended to content for tasks
  const taskStatusIcon = isTask ? getStatusIcon(node.task_status) : null

  // Background/text colors
  // Node colors only affect the fold marker icon, NOT the background
  // Only selection state affects background (yellow bg, black text)
  let backgroundColor: string | undefined
  let textColor: string | undefined

  if (isSelected || isMultiSelected) {
    // Design system: yellow background, black foreground for selection
    backgroundColor = "yellow"
    textColor = "black"
  }
  // No colored background for nodes with ownColor - color only applies to fold marker

  // Dim state for done/dropped tasks (no strikethrough per design)
  const isDoneOrDropped =
    isTask && (node.task_status === "done" || node.task_status === "dropped")
  const isInactiveChild = dimInactiveChildren && depth > 0
  const shouldDim = isDoneOrDropped || isInactiveChild
  const shouldStrikethrough = false // Disabled per design decision

  return {
    backgroundColor,
    textColor,
    shouldDim,
    shouldStrikethrough,
    taskStatusIcon,
    ownColor,
  }
}

// =============================================================================
// Prefix Helpers
// =============================================================================

export interface PrefixResult {
  /** The fold marker character (●/•/·) */
  markerChar: string
  /** Color for the fold marker */
  markerColor: string | undefined
  /** Space after marker */
  afterMarker: string
  /** Total prefix length in characters */
  length: number
  /** Folded count suffix e.g. " (5)" */
  foldedCount: string
}

/** Width reserved for fold marker (single char) */
const MARKER_SLOT_WIDTH = 1

/**
 * Build the prefix portion of a tree node line.
 *
 * New cards style layout: [marker][space]
 *   - marker: fold state indicator (● folded, • unfolded, · empty)
 *   - space: single space before content
 *
 * Note: Depth-based indentation is handled by Box paddingLeft in TreeNode,
 * not by text spaces in the prefix. This avoids wrap-ansi trimming issues.
 *
 * @param hasChildren - Whether the node has children
 * @param isFolded - Whether children are hidden
 * @param childCount - Number of children (for fold count display)
 * @param ownColor - Node's own color (applies to marker)
 */
export function buildPrefix(
  hasChildren: boolean,
  isFolded: boolean,
  childCount: number,
  ownColor: string | undefined,
): PrefixResult {
  // Get fold marker based on children state
  const marker = getFoldMarker(hasChildren, isFolded, ownColor)

  // Layout: [marker][space] + [count if folded] - no depth indent (handled by Box)
  // When folded, the space comes from the start of foldedCount
  // When not folded, afterMarker provides the space
  const isFoldedWithChildren = hasChildren && isFolded
  const afterMarker = isFoldedWithChildren ? "" : " " // Space before content (or empty if count replaces it)
  const foldedCount = isFoldedWithChildren ? ` ${childCount}` : ""
  const length = MARKER_SLOT_WIDTH + afterMarker.length + foldedCount.length

  return {
    markerChar: marker.char,
    markerColor: marker.color,
    afterMarker,
    length,
    foldedCount,
  }
}

// =============================================================================
// Info Suffix Helpers
// =============================================================================

/**
 * Format a due date with urgency-based styling.
 */
function formatDueDate(dueDate: Date): string {
  const dueStr = dueDate.toISOString().slice(5, 10)
  const now = new Date()
  const daysUntilDue = Math.floor(
    (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  )

  let dueDisplay = `⏰${dueStr}`
  if (daysUntilDue < 0) {
    // Overdue - red curly underline
    dueDisplay = styledUnderline("curly", [255, 80, 80], dueDisplay)
  } else if (daysUntilDue <= 1) {
    // Due today or tomorrow - orange underline
    dueDisplay = styledUnderline("curly", [255, 165, 0], dueDisplay)
  } else if (daysUntilDue <= 7) {
    // Due within a week - yellow underline
    dueDisplay = styledUnderline("single", [255, 255, 0], dueDisplay)
  }
  // No underline for dates > 7 days out

  return dueDisplay
}

/** Type for getBoardPills callback (repo is captured in closure by caller) */
export type GetBoardPillsFn = (
  node: KNode,
  excludeBoardIds: Set<string>,
) => BoardPill[]

/**
 * Build the info suffix for a node (assignee, due date, board pills).
 * In compact mode, only shows board pill dots.
 *
 * @param getBoardPills - Optional callback to get board pills (defaults to storage lookup)
 */
export function formatInfoSuffix(
  node: KNode,
  isCompact: boolean,
  excludeBoardIds: Set<string>,
  getBoardPills: GetBoardPillsFn,
): string {
  // A node is a task if it has task_status set, regardless of structural type
  const isTask = node.task_status != null

  // Board pills - show which boards this task is on
  const boardPills = isTask ? getBoardPills(node, excludeBoardIds) : []
  const boardPillsStr = formatBoardPills(boardPills, isCompact)

  if (!isCompact) {
    const infoParts: string[] = []

    if (node.assigned_to) infoParts.push(`@${node.assigned_to}`)

    if (node.due_date) {
      infoParts.push(formatDueDate(new Date(node.due_date)))
    } else if (node.scheduled_date) {
      const schedStr = new Date(node.scheduled_date).toISOString().slice(5, 10)
      infoParts.push(`▶${schedStr}`)
    }

    if (boardPillsStr) infoParts.push(boardPillsStr)

    return infoParts.length > 0 ? `  ${infoParts.join(" ")}` : ""
  }

  // Compact mode: just show the colored dots
  return boardPillsStr ? ` ${boardPillsStr}` : ""
}

// =============================================================================
// Context Helpers
// =============================================================================

/**
 * Truncate parent context string for inline display.
 */
export function truncateContext(
  context: string | null,
  maxLen: number,
): string | null {
  if (!context) return null
  return context.length > maxLen ? context.slice(0, maxLen - 1) + "…" : context
}
