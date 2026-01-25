/**
 * Board Pills - Show which boards a task is on
 *
 * Tasks linked to boards show colored pills indicating board membership.
 * Color comes from:
 * 1. Board's rules.color attribute (custom override)
 * 2. GTD default colors (inbox=white, next=cyan, waiting=yellow, etc.)
 * 3. Inherited from parent section
 */

import type { KNode } from "@km/core";
import type { Vault } from "@km/storage";
import { getNodeDisplayName } from "./state.ts";
import {
  GTD_BOARD_COLORS,
  normalizeBoardName,
  colorize,
} from "./text/index.ts";

export interface BoardPill {
  name: string; // Display name (e.g., "next" or "My Board")
  color: string; // Chalk color name
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
    return node.rules.color;
  }
  const dataRules = node.data?.rules as { color?: string } | undefined;
  if (dataRules?.color) {
    return dataRules.color;
  }
  return undefined;
}

/**
 * Get the effective color for a node, checking ancestors for inherited color
 * Used for board pills and other displays that need inherited colors
 *
 * Note: For file nodes, H1 rules are stored in node.data.rules (not node.rules)
 */
export function getInheritedColor(
  vault: Vault,
  node: KNode,
): string | undefined {
  // Check node's own color first
  const ownColor = getOwnColor(node);
  if (ownColor) {
    return ownColor;
  }

  // Check ancestors for inherited color
  const ancestors = vault.getAncestors(node.id);
  for (const ancestor of ancestors) {
    const ancestorColor = getOwnColor(ancestor);
    if (ancestorColor) {
      return ancestorColor;
    }
  }

  return undefined;
}

/**
 * Get the board (column parent) for a link node
 * Returns the first section/file ancestor that represents a board column
 */
function getBoardForLink(vault: Vault, linkNode: KNode): KNode | null {
  if (!linkNode.parent_id) return null;

  const parent = vault.getNode(linkNode.parent_id);
  if (!parent) return null;

  // The link's parent is typically the board column (a section)
  // If the parent is a section or file, that's our board
  if (parent.type === "section" || parent.type === "file") {
    return parent;
  }

  // Otherwise, look up ancestors to find the board
  const ancestors = vault.getAncestors(linkNode.id);
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
 * @param vault - Vault instance for querying nodes
 * @param taskNode - The task to check for board membership
 * @param excludeBoardIds - Board IDs to exclude (e.g., current view's board)
 * @returns Array of board pills with name and color
 */
export function getBoardPills(
  vault: Vault,
  taskNode: KNode,
  excludeBoardIds: Set<string> = new Set(),
): BoardPill[] {
  // Only nodes with task_status can be on boards (regardless of structural type)
  if (taskNode.task_status == null) return [];

  // Find all links pointing to this task
  const links = vault.getLinksTo(taskNode.id);
  if (links.length === 0) return [];

  const pills: BoardPill[] = [];
  const seenBoards = new Set<string>();

  for (const link of links) {
    const board = getBoardForLink(vault, link);
    if (!board) continue;

    // Skip if this board is excluded (we're viewing it)
    if (excludeBoardIds.has(board.id)) continue;

    // Skip duplicates
    if (seenBoards.has(board.id)) continue;
    seenBoards.add(board.id);

    const boardName = getNodeDisplayName(vault, board);

    // Get color: custom rules > inherited > GTD default
    const customColor = getInheritedColor(vault, board);
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

/**
 * Get header text styling for column/section headers
 * Handles own color, selection state, and accessibility
 *
 * Design system:
 * - All headers are bold
 * - Default: white text on no background, with grey marker
 * - Cursor in column: yellow text, marker uses node's color (if defined)
 * - Column selected (selectionLevel=column): inverse yellow (yellow bg + black text)
 *
 * Note: The colored marker is rendered separately by the column component
 */
export function getHeaderStyle(
  _ownColor: string | undefined,
  isSelected: boolean,
  isActiveSelection: boolean,
): { color: string; backgroundColor: string | undefined; dimColor: boolean } {
  // When actively selected (column is the selection cursor), use inverse yellow
  if (isActiveSelection) {
    return {
      color: "black",
      backgroundColor: "yellow",
      dimColor: false,
    };
  }

  // Default styling:
  // - Yellow when cursor is in this column (isSelected)
  // - White when cursor is elsewhere
  // Note: headers are always bold (handled by component)
  return {
    color: isSelected ? "yellow" : "white",
    backgroundColor: undefined,
    dimColor: false,
  };
}
