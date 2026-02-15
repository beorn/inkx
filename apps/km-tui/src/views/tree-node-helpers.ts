/**
 * Helper functions for TreeNode component
 *
 * Pure functions extracted from TreeNode for testability and clarity.
 */

import { extractTitleTaskMarker, type KNode } from "@km/core"
import { getStatusIcon, type StatusIcon } from "../text/index.ts"
import { formatBoardPills, getOwnColor, type BoardPill } from "../board-pills.ts"

// =============================================================================
// Content Helpers
// =============================================================================

/**
 * Strip markdown task marker from the beginning of text.
 * Uses the shared extractTitleTaskMarker from @km/core.
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
  return extractTitleTaskMarker(text).cleanText
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
  isInlineEditing = false,
): NodeStyleResult {
  // A node is a task if it has task_status set, regardless of structural type
  const isTask = node.task_status != null
  const ownColor = getOwnColor(node)

  // Task status icon: prepended to content for tasks
  const taskStatusIcon = isTask ? getStatusIcon(node.task_status) : null

  // Background/text colors
  // Node colors only affect the fold marker icon, NOT the background
  // Selection: yellow bg, black text. Inline edit: blue bg, white text.
  let backgroundColor: string | undefined
  let textColor: string | undefined

  if (isInlineEditing) {
    // Edit mode: blue background spans full row via parent Box
    backgroundColor = "blueBright"
    textColor = "white"
  } else if (isSelected || isMultiSelected) {
    // Design system: yellow background, black foreground for selection
    backgroundColor = "yellow"
    textColor = "black"
  }
  // No colored background for nodes with ownColor - color only applies to fold marker

  // Dim state for done/dropped tasks (no strikethrough per design)
  const isDoneOrDropped = isTask && (node.task_status === "done" || node.task_status === "dropped")
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
  /** The bullet character */
  markerChar: string
  /** Color for the bullet */
  markerColor: string | undefined
  /** Space after marker */
  afterMarker: string
  /** Total prefix length in characters */
  length: number
}

/**
 * Build the prefix portion of a tree node line.
 *
 * Layout: [bullet][space] = 2 cells total.
 * The bullet is type-specific, circle, or fold marker depending on icon style.
 *
 * Note: Depth-based indentation is handled by Box paddingLeft in TreeNode,
 * not by text spaces in the prefix. This avoids wrap-ansi trimming issues.
 *
 * @param bulletIcon - The bullet icon to display
 */
export function buildPrefix(bulletIcon: StatusIcon): PrefixResult {
  return {
    markerChar: bulletIcon.char,
    markerColor: bulletIcon.color,
    afterMarker: " ",
    length: 2,
  }
}

// =============================================================================
// Info Suffix Helpers
// =============================================================================

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const RESET = "\x1b[0m"

/** Format a date as "Feb 11" */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** Compute days from today (negative = past, 0 = today, positive = future) */
function daysFromToday(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}

/**
 * Format a date as a relative string:
 * - Past: "Feb 12"
 * - Today: "Today"
 * - Tomorrow: "Tomorrow"
 * - 2-6 days: day name ("Sunday", "Monday", ...)
 * - 7+ days: "Feb 20"
 */
function formatRelativeDate(dateStr: string): string {
  const diff = daysFromToday(dateStr)
  if (diff < 0) return formatShortDate(dateStr)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff <= 6) return DAYS[new Date(dateStr).getUTCDay()] ?? formatShortDate(dateStr)
  return formatShortDate(dateStr)
}

/**
 * Format a due date with urgency coloring:
 * - Overdue: red
 * - Today/Tomorrow: green
 * - Future: no color
 */
function formatDueDisplay(dateStr: string): string {
  const diff = daysFromToday(dateStr)
  const text = formatRelativeDate(dateStr)
  if (diff < 0) return `${RED}${text}${RESET}`
  if (diff <= 1) return `${GREEN}${text}${RESET}`
  return text
}

// Priority ANSI colors: P1=red, P2=yellow, P3=bright yellow, P4=dim
const PRIORITY_COLORS = ["\x1b[31m", "\x1b[33m", "\x1b[93m", "\x1b[2m"]

/**
 * Build a compact right-aligned date badge for a node.
 * Format: `P2 Mar 10 → Today ↻` (each part optional, space-separated)
 * Uses relative dates (Today, Tomorrow, day names) and urgency coloring on due dates.
 * Visible in both cards and columns view.
 */
export function formatDateBadge(node: KNode): string {
  const parts: string[] = []

  // Priority badge
  if (node.priority && node.priority >= 1 && node.priority <= 4) {
    const color = PRIORITY_COLORS[node.priority - 1] ?? ""
    parts.push(`${color}P${node.priority}\x1b[0m`)
  }

  // Start date → due date (or just one)
  // Hide past start dates for WIP tasks (already started, not useful info)
  const hasStart = !!node.scheduled_date
  const startInPast = hasStart && daysFromToday(node.scheduled_date!) < 0
  const showStart = hasStart && !(startInPast && node.task_status === "wip")
  const hasDue = !!node.due_date

  if (showStart && hasDue) {
    parts.push(`${formatRelativeDate(node.scheduled_date!)} → ${formatDueDisplay(node.due_date!)}`)
  } else if (showStart) {
    parts.push(`${formatRelativeDate(node.scheduled_date!)} →`)
  } else if (hasDue) {
    parts.push(formatDueDisplay(node.due_date!))
  }

  // Recurrence
  if (node.recurrence) {
    parts.push("↻")
  }

  return parts.length > 0 ? parts.join(" ") : ""
}

/** Type for getBoardPills callback (repo is captured in closure by caller) */
export type GetBoardPillsFn = (node: KNode, excludeBoardIds: Set<string>) => BoardPill[]

/**
 * Build the info suffix for a node (assignee + board pills).
 * Date/priority/recurrence are handled separately by formatDateBadge.
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
export function truncateContext(context: string | null, maxLen: number): string | null {
  if (!context) return null
  return context.length > maxLen ? context.slice(0, maxLen - 1) + "⋯" : context
}
