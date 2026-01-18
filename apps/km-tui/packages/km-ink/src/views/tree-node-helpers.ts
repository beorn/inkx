/**
 * Helper functions for TreeNode component
 *
 * Pure functions extracted from TreeNode for testability and clarity.
 */

import type { KNode } from "@km/core";
import { getTypeIcon, getNodeIcon, styledUnderline } from "../text/index.ts";
import {
  getBoardPills as getBoardPillsFromStorage,
  formatBoardPills,
  getOwnColor,
  type BoardPill,
} from "../board-pills.ts";

// =============================================================================
// Constants
// =============================================================================

/** Colors that need white text for contrast */
export const DARK_BG_COLORS = [
  "red",
  "green",
  "blue",
  "magenta",
  "gray",
  "grey",
];

/** Variant-specific configuration */
export const VARIANT_CONFIG = {
  compact: { maxChildren: 8, showInfoColumns: false },
  wide: { maxChildren: Infinity, showInfoColumns: true },
} as const;

// =============================================================================
// Style Helpers
// =============================================================================

export interface NodeStyleResult {
  backgroundColor: string | undefined;
  textColor: string | undefined;
  shouldDim: boolean;
  shouldStrikethrough: boolean;
  icon: {
    char: string;
    color: string | undefined;
    bgColor: string | undefined;
  };
}

/**
 * Compute all styling for a node in one place.
 * Handles selection, own color, task status icons, dim state, and strikethrough.
 */
export function getNodeStyle(
  node: KNode,
  isSelected: boolean,
  isMultiSelected: boolean,
  dimInactiveChildren: boolean,
  depth: number,
): NodeStyleResult {
  const isTask = node.type === "task";
  const ownColor = getOwnColor(node);

  // Icon: tasks use status icon, others use type icon
  const nodeIcon = isTask ? getNodeIcon(node.task_status, ownColor) : null;
  const typeIcon = isTask ? "" : getTypeIcon(node.type);
  const icon = {
    char: nodeIcon ? nodeIcon.char : typeIcon,
    color: nodeIcon?.color,
    bgColor: nodeIcon?.backgroundColor,
  };

  // Background/text colors
  let backgroundColor: string | undefined;
  let textColor: string | undefined;
  const hasColoredBg = !isTask && !!ownColor;

  if (isSelected || isMultiSelected) {
    // Design system: cyan background, black foreground for selection
    backgroundColor = "cyan";
    textColor = "black";
  } else if (hasColoredBg && ownColor) {
    backgroundColor = ownColor;
    textColor = DARK_BG_COLORS.includes(ownColor) ? "white" : "black";
  }

  // Dim state for done/dropped tasks (no strikethrough per design)
  const isDoneOrDropped =
    isTask && (node.task_status === "done" || node.task_status === "dropped");
  const isInactiveChild = dimInactiveChildren && depth > 0;
  const shouldDim = isDoneOrDropped || isInactiveChild;
  const shouldStrikethrough = false; // Disabled per design decision

  return { backgroundColor, textColor, shouldDim, shouldStrikethrough, icon };
}

// =============================================================================
// Prefix Helpers
// =============================================================================

export interface PrefixResult {
  beforeIcon: string;
  afterIcon: string;
  iconChar: string;
  iconColor: string | undefined;
  iconBgColor: string | undefined;
  length: number;
  foldedCount: string;
}

/**
 * Build the prefix portion of a tree node line.
 * Returns indent + fold indicator + icon info.
 */
export function buildPrefix(
  depth: number,
  hasChildren: boolean,
  isFolded: boolean,
  childCount: number,
  icon: {
    char: string;
    color: string | undefined;
    bgColor: string | undefined;
  },
): PrefixResult {
  const indent = " ".repeat(depth);
  const foldIndicator = hasChildren ? (isFolded ? "▶" : "▼") : " ";
  const foldedCount = hasChildren && isFolded ? ` (${childCount})` : "";

  const beforeIcon = `${indent}${foldIndicator}`;
  const afterIcon = " ";
  const length = beforeIcon.length + icon.char.length + afterIcon.length;

  return {
    beforeIcon,
    afterIcon,
    iconChar: icon.char,
    iconColor: icon.color,
    iconBgColor: icon.bgColor,
    length,
    foldedCount,
  };
}

// =============================================================================
// Info Suffix Helpers
// =============================================================================

/**
 * Format a due date with urgency-based styling.
 */
function formatDueDate(dueDate: Date): string {
  const dueStr = dueDate.toISOString().slice(5, 10);
  const now = new Date();
  const daysUntilDue = Math.floor(
    (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  let dueDisplay = `⏰${dueStr}`;
  if (daysUntilDue < 0) {
    // Overdue - red curly underline
    dueDisplay = styledUnderline("curly", [255, 80, 80], dueDisplay);
  } else if (daysUntilDue <= 1) {
    // Due today or tomorrow - orange underline
    dueDisplay = styledUnderline("curly", [255, 165, 0], dueDisplay);
  } else if (daysUntilDue <= 7) {
    // Due within a week - yellow underline
    dueDisplay = styledUnderline("single", [255, 255, 0], dueDisplay);
  }
  // No underline for dates > 7 days out

  return dueDisplay;
}

/** Type for getBoardPills callback */
export type GetBoardPillsFn = (
  node: KNode,
  excludeBoardIds: Set<string>,
) => BoardPill[];

/**
 * Build the info suffix for a node (priority, assignee, due date, board pills).
 * In compact mode, only shows board pill dots.
 *
 * @param getBoardPills - Optional callback to get board pills (defaults to storage lookup)
 */
export function formatInfoSuffix(
  node: KNode,
  isCompact: boolean,
  excludeBoardIds: Set<string>,
  getBoardPills: GetBoardPillsFn = getBoardPillsFromStorage,
): string {
  const isTask = node.type === "task";

  // Board pills - show which boards this task is on
  const boardPills = isTask ? getBoardPills(node, excludeBoardIds) : [];
  const boardPillsStr = formatBoardPills(boardPills, isCompact);

  if (!isCompact) {
    const infoParts: string[] = [];

    if (node.priority) infoParts.push(`P${node.priority}`);
    if (node.assigned_to) infoParts.push(`@${node.assigned_to}`);

    if (node.due_date) {
      infoParts.push(formatDueDate(new Date(node.due_date)));
    } else if (node.scheduled_date) {
      const schedStr = new Date(node.scheduled_date).toISOString().slice(5, 10);
      infoParts.push(`▶${schedStr}`);
    }

    if (boardPillsStr) infoParts.push(boardPillsStr);

    return infoParts.length > 0 ? `  ${infoParts.join(" ")}` : "";
  }

  // Compact mode: just show the colored dots
  return boardPillsStr ? ` ${boardPillsStr}` : "";
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
  if (!context) return null;
  return context.length > maxLen ? context.slice(0, maxLen - 1) + "…" : context;
}
