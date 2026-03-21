/**
 * Helper functions for TreeNode component
 *
 * Pure functions extracted from TreeNode for testability and clarity.
 */

import React from "react"
import { Text } from "@silvery/react"
import { extractTitleTaskMarker, isTask, decomposeDatetime, type KNode } from "@km/core"
import { getStatusIcon, type StatusIcon } from "../text/index.ts"
import { formatBoardPills, getOwnColor, type BoardPill } from "../board-pills.ts"

// =============================================================================
// HR Detection
// =============================================================================

/** Matches markdown thematic breaks: 3+ of the same character (---, ***, ___) */
export const HR_PATTERN = /^(-{3,}|\*{3,}|_{3,})$/

/** Test whether trimmed content is a horizontal rule */
export function isHRContent(content: string): boolean {
  return HR_PATTERN.test(content.trim())
}

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
  // (e.g., People folder with 3k+ children creating 40k+ silvery nodes)
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
  /** True when task is done/dropped — used to strip metadata colors (dates, priority) */
  isDoneOrDropped: boolean
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
  _dimInactiveChildren: boolean,
  _depth: number,
  isInlineEditing = false,
  _paneFocused = true,
): NodeStyleResult {
  const nodeIsTask = isTask(node)
  const ownColor = getOwnColor(node)

  // Task status icon: prepended to content for tasks
  // For implicit tasks (no explicit status), show the "todo" icon
  const taskStatusIcon = nodeIsTask ? getStatusIcon(node.task_status ?? "todo") : null

  // Background/text colors
  // Node colors only affect the fold marker icon, NOT the background
  // Selection: yellow bg, black text. Inline edit: blue bg, white text.
  // When pane is unfocused, selection uses dim yellow to indicate inactive cursor.
  let backgroundColor: string | undefined
  let textColor: string | undefined

  if (isInlineEditing) {
    // Edit mode: no background fill — cyan border (CardColumn) + inverse cursor indicate editing
    backgroundColor = undefined
    textColor = undefined
  } else if (isSelected || isMultiSelected) {
    // Selected: gold bg, dark text. Per-pane theme dims $selected for unfocused panes.
    backgroundColor = "$selection-bg"
    textColor = "$selection"
  }
  // Default (no assignment): inherits $fg from WorkspaceView wrapper via silvery fg inheritance
  // No colored background for nodes with ownColor - color only applies to fold marker

  // Dim state for done/dropped tasks (no strikethrough per design)
  // Only explicit task statuses trigger dimming — implicit tasks are never dimmed
  const isDoneOrDropped = node.task_status === "done" || node.task_status === "dropped"
  const shouldDim = isDoneOrDropped
  const shouldStrikethrough = false // Disabled per design decision

  return {
    backgroundColor,
    textColor,
    shouldDim,
    isDoneOrDropped,
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
const RED_BOLD = "\x1b[1;31m"
const GREEN = "\x1b[32m"
const DIM_CYAN = "\x1b[2;36m"
const RESET = "\x1b[0m"

/** Format a date as "Feb 11" (same year) or "Feb 11 '25" (different year) */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const month = MONTHS[d.getUTCMonth()]
  const day = d.getUTCDate()
  if (d.getUTCFullYear() !== now.getFullYear()) {
    const yr = String(d.getUTCFullYear()).slice(-2)
    return `${month} ${day} '${yr}`
  }
  return `${month} ${day}`
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
 * - Yesterday: "Yesterday"
 * - Today: "Today"
 * - Tomorrow: "Tomorrow"
 * - 2-6 days ahead: day name ("Sunday", "Monday", ...)
 * - All other: "Feb 20" (same year) or "Feb 20 '25" (different year)
 */
function formatRelativeDate(dateStr: string): string {
  const diff = daysFromToday(dateStr)
  if (diff === -1) return "Yesterday"
  if (diff < 0) return formatShortDate(dateStr)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff <= 6) return DAYS[new Date(dateStr).getUTCDay()] ?? formatShortDate(dateStr)
  return formatShortDate(dateStr)
}

/**
 * Format a due date with urgency coloring:
 * - Overdue: red bold
 * - Today/Tomorrow: green
 * - Future: dim cyan
 */
function formatDueDisplay(dateStr: string): string {
  const diff = daysFromToday(dateStr)
  const text = formatRelativeDate(dateStr)
  if (diff < 0) return `${RED_BOLD}${text}${RESET}`
  if (diff <= 1) return `${GREEN}${text}${RESET}`
  return `${DIM_CYAN}${text}${RESET}`
}

/**
 * Format a scheduled/start date with coloring:
 * - Today/Tomorrow: green (actionable now)
 * - Future: dim cyan
 * - Past: no color (past start dates are already hidden for WIP)
 */
function formatScheduledDisplay(dateStr: string): string {
  const diff = daysFromToday(dateStr)
  const text = formatRelativeDate(dateStr)
  if (diff >= 0 && diff <= 1) return `${GREEN}${text}${RESET}`
  if (diff > 1) return `${DIM_CYAN}${text}${RESET}`
  return text
}

const PRIORITY_COLOR_MAP: Record<string, string> = {
  P0: "\x1b[1;31m", // bold red
  P1: "\x1b[31m", // red
  P2: "\x1b[33m", // yellow
  P3: "\x1b[93m", // bright yellow
  P4: "\x1b[2m", // dim
}

/**
 * Build a compact right-aligned date badge for a node (ANSI string version).
 * Format: `P2 Mar 10 → Today ↻` (each part optional, space-separated)
 * Uses relative dates (Today, Tomorrow, day names) and urgency coloring on due dates.
 *
 */
export function formatDateBadge(node: KNode): string {
  const parts: string[] = []

  // Priority badge — display the string as-is, color known P-values
  if (node.priority) {
    const color = PRIORITY_COLOR_MAP[node.priority.toUpperCase()] ?? ""
    const reset = color ? "\x1b[0m" : ""
    parts.push(`${color}${node.priority}${reset}`)
  }

  const dueDate = decomposeDatetime(node.due_at)?.date
  const startDate = decomposeDatetime(node.start_at)?.date

  // Start date → due date (or just one)
  // Hide past start dates for WIP tasks (already started, not useful info)
  const startInPast = startDate ? daysFromToday(startDate) < 0 : false
  const visibleStart = startDate && !(startInPast && node.task_status === "wip") ? startDate : undefined

  if (visibleStart && dueDate) {
    parts.push(`${formatScheduledDisplay(visibleStart)} → ${formatDueDisplay(dueDate)}`)
  } else if (visibleStart) {
    parts.push(`${formatScheduledDisplay(visibleStart)} →`)
  } else if (dueDate) {
    parts.push(formatDueDisplay(dueDate))
  }

  // Recurrence
  if (node.rrule) {
    parts.push("↻")
  }

  return parts.length > 0 ? parts.join(" ") : ""
}

/**
 * Convert an assignee name to a short code (initials).
 * Splits on hyphens/underscores/spaces and takes the first letter of each segment.
 *
 * @example shortName("bjorn-stabell") // "BS"
 * @example shortName("beorn") // "B"
 * @example shortName("alice-bob-charlie") // "ABC"
 */
export function shortName(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter((s) => s.length > 0)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
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
  // Board pills - show which boards this task is on
  const boardPills = isTask(node) ? getBoardPills(node, excludeBoardIds) : []
  const boardPillsStr = formatBoardPills(boardPills, isCompact)

  if (!isCompact) {
    const infoParts: string[] = []

    if (node.assigned_to) infoParts.push(`@${shortName(node.assigned_to)}`)
    if (boardPillsStr) infoParts.push(boardPillsStr)

    return infoParts.length > 0 ? `  ${infoParts.join(" ")}` : ""
  }

  // Compact mode: just show the colored dots
  return boardPillsStr ? ` ${boardPillsStr}` : ""
}

// =============================================================================
// Subtask Count Badge
// =============================================================================

/**
 * Build a compact subtask progress badge for card titles.
 * Shows done/total when the node has task children (e.g., "3/7").
 * Returns null if there are no task children.
 */
export function formatSubtaskBadge(children: KNode[]): string | null {
  let total = 0
  let done = 0
  for (const child of children) {
    if (!isTask(child)) continue
    total++
    if (child.task_status === "done" || child.task_status === "dropped") done++
  }
  if (total === 0) return null
  return `${done}/${total}`
}

// =============================================================================
// Dependency Badge
// =============================================================================

/**
 * Parse dependency references from node.data.deps or node.data.blocks.
 * Returns array of reference IDs (with ^ prefix stripped).
 */
export function parseDepsRefs(data: Record<string, unknown>, field: "deps" | "blocks"): string[] {
  const raw = data[field]
  if (typeof raw !== "string" || raw.length === 0) return []
  return raw.split(",").map((r) => r.trim().replace(/^\^/, ""))
}

/**
 * Check if a node has unresolved dependencies (deps where the target is not done).
 * Returns true if the node has deps and at least one is not done/dropped.
 */
export function hasUnresolvedDeps(node: KNode, getNode: (id: string) => KNode | null | undefined): boolean {
  const refs = parseDepsRefs(node.data, "deps")
  if (refs.length === 0) return false
  for (const ref of refs) {
    const target = getNode(ref)
    if (!target || (target.task_status !== "done" && target.task_status !== "dropped")) return true
  }
  return false
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

// =============================================================================
// React Component Equivalents
// =============================================================================

// Priority text colors for known P-values: P0/P1=error, P2=warning, P3=primary, P4=dim
const PRIORITY_TEXT_COLOR_MAP: Record<string, { color: string | undefined; dim: boolean }> = {
  P0: { color: "$error", dim: false },
  P1: { color: "$error", dim: false },
  P2: { color: "$warning", dim: false },
  P3: { color: "$primary", dim: false },
  P4: { color: undefined, dim: true },
}

/**
 * React component version of formatDateBadge.
 * Uses <Text color="..."> props instead of raw ANSI escape codes.
 */
export function DateBadge({ node, stripColor }: { node: KNode; stripColor?: boolean }): React.ReactElement | null {
  const parts: React.ReactElement[] = []

  // Priority badge — display the string as-is, color known P-values
  if (node.priority) {
    const style = stripColor ? undefined : PRIORITY_TEXT_COLOR_MAP[node.priority.toUpperCase()]
    parts.push(
      <Text key="p" color={style?.color} dimColor={style?.dim}>
        {node.priority}
      </Text>,
    )
  }

  const dueDate = decomposeDatetime(node.due_at)?.date
  const startDate = decomposeDatetime(node.start_at)?.date

  // Hide past start dates for WIP tasks (already started, not useful info)
  const startInPast = startDate ? daysFromToday(startDate) < 0 : false
  const visibleStart = startDate && !(startInPast && node.task_status === "wip") ? startDate : undefined

  if (visibleStart && dueDate) {
    parts.push(
      <React.Fragment key="sd">
        <ScheduledDateText dateStr={visibleStart} stripColor={stripColor} />
        <Text> → </Text>
        <DueDateText dateStr={dueDate} stripColor={stripColor} />
      </React.Fragment>,
    )
  } else if (visibleStart) {
    parts.push(
      <React.Fragment key="s">
        <ScheduledDateText dateStr={visibleStart} stripColor={stripColor} />
        <Text> →</Text>
      </React.Fragment>,
    )
  } else if (dueDate) {
    parts.push(<DueDateText key="d" dateStr={dueDate} stripColor={stripColor} />)
  }

  // Recurrence
  if (node.rrule) {
    parts.push(<Text key="r">↻</Text>)
  }

  if (parts.length === 0) return null
  return (
    <Text>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? " " : ""}
          {p}
        </React.Fragment>
      ))}
    </Text>
  )
}

/** Due date with urgency coloring: overdue=red bold, today/tomorrow=green, future=dim cyan */
function DueDateText({ dateStr, stripColor }: { dateStr: string; stripColor?: boolean }): React.ReactElement {
  const diff = daysFromToday(dateStr)
  const text = formatRelativeDate(dateStr)
  if (stripColor) return <Text>{text}</Text>
  if (diff < 0) {
    return (
      <Text color={"$error"} bold>
        {text}
      </Text>
    )
  }
  if (diff <= 1) return <Text color={"$success"}>{text}</Text>
  return (
    <Text color={"$primary"} dimColor>
      {text}
    </Text>
  )
}

/** Scheduled date with coloring: today/tomorrow=green, future=dim cyan, past=no color */
function ScheduledDateText({ dateStr, stripColor }: { dateStr: string; stripColor?: boolean }): React.ReactElement {
  const diff = daysFromToday(dateStr)
  const text = formatRelativeDate(dateStr)
  if (stripColor) return <Text>{text}</Text>
  if (diff >= 0 && diff <= 1) return <Text color={"$success"}>{text}</Text>
  if (diff > 1) {
    return (
      <Text color={"$primary"} dimColor>
        {text}
      </Text>
    )
  }
  return <Text>{text}</Text>
}

/**
 * React component version of formatBoardPills.
 * Uses <Text color="..."> props instead of ANSI colorize().
 */
export function BoardPillsView({
  pills,
  compact,
  stripColor,
}: {
  pills: BoardPill[]
  compact: boolean
  stripColor?: boolean
}): React.ReactElement | null {
  if (pills.length === 0) return null
  if (compact) {
    return (
      <>
        {pills.map((p, i) => (
          <Text key={i} color={stripColor ? undefined : p.color}>
            ●
          </Text>
        ))}
      </>
    )
  }
  return (
    <>
      {pills.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? " " : ""}
          <Text color={stripColor ? undefined : p.color}>@{p.name}</Text>
        </React.Fragment>
      ))}
    </>
  )
}

/**
 * React component version of formatInfoSuffix.
 * Shows assignee + board pills using <Text> color props.
 */
export function InfoSuffix({
  node,
  isCompact,
  excludeBoardIds,
  getBoardPills,
  stripColor,
}: {
  node: KNode
  isCompact: boolean
  excludeBoardIds: Set<string>
  getBoardPills: GetBoardPillsFn
  stripColor?: boolean
}): React.ReactElement | null {
  const boardPills = isTask(node) ? getBoardPills(node, excludeBoardIds) : []

  if (!isCompact) {
    const hasAssignee = !!node.assigned_to
    const hasPills = boardPills.length > 0
    if (!hasAssignee && !hasPills) return null

    return (
      <Text>
        {"  "}
        {hasAssignee && node.assigned_to && <Text>@{shortName(node.assigned_to)}</Text>}
        {hasAssignee && hasPills && " "}
        {hasPills && <BoardPillsView pills={boardPills} compact={false} stripColor={stripColor} />}
      </Text>
    )
  }

  if (boardPills.length === 0) return null
  return (
    <Text>
      {" "}
      <BoardPillsView pills={boardPills} compact stripColor={stripColor} />
    </Text>
  )
}
