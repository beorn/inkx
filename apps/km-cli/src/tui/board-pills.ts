/**
 * Board Pills - Show which boards a task is on
 *
 * Tasks symlinked to boards show colored pills indicating board membership.
 * Color comes from:
 * 1. Board's rules.color attribute (custom override)
 * 2. GTD default colors (inbox=white, next=cyan, waiting=yellow, etc.)
 * 3. Inherited from parent section
 */

import type { Node } from "@km/core";
import { getSymlinksTo, getNode, getAncestors } from "@km/store";
import { getNodeDisplayName } from "@km/shared";
import {
  GTD_BOARD_COLORS,
  normalizeBoardName,
  colorize,
} from "../text/index.ts";

export interface BoardPill {
  name: string; // Display name (e.g., "next" or "My Board")
  color: string; // Chalk color name
}

/**
 * Get the effective color for a node, checking ancestors for inherited color
 */
function getInheritedColor(node: Node): string | undefined {
  // Check node's own rules first
  if (node.rules?.color) {
    return node.rules.color;
  }

  // Check ancestors for inherited color
  const ancestors = getAncestors(node.id);
  for (const ancestor of ancestors) {
    if (ancestor.rules?.color) {
      return ancestor.rules.color;
    }
  }

  return undefined;
}

/**
 * Get the board (column parent) for a symlink node
 * Returns the first section/file ancestor that represents a board column
 */
function getBoardForSymlink(symlinkNode: Node): Node | null {
  if (!symlinkNode.parent_id) return null;

  const parent = getNode(symlinkNode.parent_id);
  if (!parent) return null;

  // The symlink's parent is typically the board column (a section)
  // If the parent is a section or file, that's our board
  if (parent.type === "section" || parent.type === "file") {
    return parent;
  }

  // Otherwise, look up ancestors to find the board
  const ancestors = getAncestors(symlinkNode.id);
  for (const ancestor of ancestors) {
    if (ancestor.type === "section" || ancestor.type === "file") {
      return ancestor;
    }
  }

  return null;
}

/**
 * Get board pills for a task node
 *
 * @param taskNode - The task to check for board membership
 * @param excludeBoardIds - Board IDs to exclude (e.g., current view's board)
 * @returns Array of board pills with name and color
 */
export function getBoardPills(
  taskNode: Node,
  excludeBoardIds: Set<string> = new Set(),
): BoardPill[] {
  // Only tasks can be on boards
  if (taskNode.type !== "task") return [];

  // Find all symlinks pointing to this task
  const symlinks = getSymlinksTo(taskNode.id);
  if (symlinks.length === 0) return [];

  const pills: BoardPill[] = [];
  const seenBoards = new Set<string>();

  for (const symlink of symlinks) {
    const board = getBoardForSymlink(symlink);
    if (!board) continue;

    // Skip if this board is excluded (we're viewing it)
    if (excludeBoardIds.has(board.id)) continue;

    // Skip duplicates
    if (seenBoards.has(board.id)) continue;
    seenBoards.add(board.id);

    const boardName = getNodeDisplayName(board);

    // Get color: custom rules > inherited > GTD default
    const customColor = getInheritedColor(board);
    const gtdColor = GTD_BOARD_COLORS[normalizeBoardName(boardName)];
    const color = customColor || gtdColor || "white";

    pills.push({
      name: boardName,
      color,
    });
  }

  return pills;
}

/**
 * Format board pills as a string for display
 *
 * @param pills - Board pills to format
 * @param compact - If true, show just colored dots instead of full names
 */
export function formatBoardPills(
  pills: BoardPill[],
  compact: boolean = false,
): string {
  if (pills.length === 0) return "";

  if (compact) {
    // Compact: just colored dots
    return pills.map((p) => colorize("●", p.color)).join("");
  } else {
    // Full: @name format
    return pills.map((p) => colorize(`@${p.name}`, p.color)).join(" ");
  }
}
