/**
 * Board Pills - Show which boards a task is on
 *
 * Tasks linked to boards show colored pills indicating board membership.
 * Color comes from:
 * 1. Board's rules.color attribute (custom override)
 * 2. GTD default colors (inbox=white, next=cyan, waiting=yellow, etc.)
 * 3. Inherited from parent section
 */

import { KNode } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { GTD_BOARD_COLORS, normalizeBoardName, colorize } from "../text/index.ts"

export interface BoardPill {
  name: string // Display name (e.g., "next" or "My Board")
  color: string // Chalk color name
}

/**
 * Get the node's own color (not inherited from ancestors)
 * For icon display - only the defining node should show a colored icon
 *
 * Note: For file nodes, H1 rules are stored in node.data.rules (not node.rules)
 */
export function getOwnColor(node: KNode): string | undefined {
  // Check node's own rules (direct rules or data.rules for file nodes)
  if (node.rules?.color) {
    return node.rules.color
  }
  const dataRules = node.data?.rules as { color?: string } | undefined
  return dataRules?.color
}

/**
 * Get the effective color for a node, checking ancestors for inherited color
 * Used for board pills and other displays that need inherited colors
 *
 * Note: For file nodes, H1 rules are stored in node.data.rules (not node.rules)
 */
function getInheritedColor(repo: Repo, node: KNode): string | undefined {
  // Check node's own color first
  const ownColor = getOwnColor(node)
  if (ownColor) {
    return ownColor
  }

  // Check ancestors for inherited color
  for (const ancestor of repo.getAncestors(node.id)) {
    const ancestorColor = getOwnColor(ancestor)
    if (ancestorColor) return ancestorColor
  }
  return undefined
}

/**
 * Get the board (column parent) for a link node
 * Returns the first section/file ancestor that represents a board column
 */
function getBoardForLink(repo: Repo, linkNode: KNode): KNode | null {
  if (!linkNode.parent_id) return null

  const parent = repo.getNode(linkNode.parent_id)
  if (!parent) return null

  // The link's parent is typically the board column (an outline item)
  // If the parent is an outline item (section/file/folder), that's our board
  if (KNode.isOutline(parent)) {
    return parent
  }

  // Otherwise, look up ancestors to find the board
  const ancestors = repo.getAncestors(linkNode.id)
  for (const ancestor of ancestors) {
    if (KNode.isOutline(ancestor)) {
      return ancestor
    }
  }

  return null
}

/**
 * Get board pills for a task node
 *
 * @param repo - Repo instance for querying nodes
 * @param taskNode - The task to check for board membership
 * @param excludeBoardIds - Board IDs to exclude (e.g., current view's board)
 * @returns Array of board pills with name and color
 */
export function getBoardPills(repo: Repo, taskNode: KNode, excludeBoardIds: Set<string> = new Set()): BoardPill[] {
  // Only nodes with task_status can be on boards (regardless of structural type)
  if (taskNode.item?.task?.status == null) return []

  // Find all links pointing to this task
  const links = repo.getLinksTo(taskNode.id)
  if (links.length === 0) return []

  const pills: BoardPill[] = []
  const seenBoards = new Set<string>()

  for (const link of links) {
    const board = getBoardForLink(repo, link)
    if (!board) continue

    // Skip if this board is excluded (we're viewing it)
    if (excludeBoardIds.has(board.id)) continue

    // Skip duplicates
    if (seenBoards.has(board.id)) continue
    seenBoards.add(board.id)

    const boardName = getNodeDisplayName(repo, board)

    // Get color: custom rules > inherited > GTD default
    const customColor = getInheritedColor(repo, board)
    const gtdColor = GTD_BOARD_COLORS[normalizeBoardName(boardName)]
    const color = customColor || gtdColor || "$fg"

    pills.push({
      name: boardName,
      color,
    })
  }

  return pills
}

/**
 * Format board pills as a string for display
 *
 * @param pills - Board pills to format
 * @param compact - If true, show just colored dots instead of full names
 */
export function formatBoardPills(pills: BoardPill[], compact: boolean = false): string {
  if (pills.length === 0) return ""

  if (compact) {
    // Compact: just colored dots
    return pills.map((p) => colorize("●", p.color)).join("")
  } else {
    // Full: @name format
    return pills.map((p) => colorize(`@${p.name}`, p.color)).join(" ")
  }
}

/**
 * Get header text styling for column/section headers
 * Handles own color, selection state, and accessibility
 *
 * Design system:
 * - All headers are bold
 * - Default: white text on no background, with grey marker
 * - Cursor in column: yellow text, marker uses node's color (if defined)
 * - Column selected (cursorDepth=column): inverse yellow (yellow bg + black text)
 *
 * Note: The colored marker is rendered separately by the column component
 */
export function getHeaderStyle(
  _ownColor: string | undefined,
  isSelected: boolean,
  isActiveSelection: boolean,
): { color: string | undefined; backgroundColor: string | undefined; dimColor: boolean } {
  // Column selected (cursor at column level): inverse yellow (like selected card title)
  // Cursor in child card: yellow fg only (no bg)
  // Cursor elsewhere: default fg
  if (isActiveSelection) {
    return {
      color: "$selection",
      backgroundColor: "$selectionbg",
      dimColor: false,
    }
  }

  return {
    color: isSelected ? "$fg-accent" : undefined,
    backgroundColor: undefined,
    dimColor: false,
  }
}
