/**
 * Icon Utilities
 *
 * Status and type icons for nodes.
 * Used by both CLI commands and TUI components.
 */

export interface StatusIcon {
  char: string;
  color: string;
  backgroundColor?: string;
}

// =============================================================================
// Fold Markers (New Cards Style)
// =============================================================================

/** Marker for nodes with children that are hidden (folded) - BIG */
export const FOLDED_MARKER: StatusIcon = {
  char: "\u25CF", // ● filled circle
  color: "white",
};

/** Marker for nodes with children that are visible (unfolded) - MEDIUM */
export const UNFOLDED_MARKER: StatusIcon = {
  char: "\u2022", // • bullet
  color: "white",
};

/** Marker for nodes without children - TINY */
export const EMPTY_MARKER: StatusIcon = {
  char: "\u00B7", // · middle dot
  color: "gray",
};

/**
 * Get fold marker based on children state and fold state.
 *
 * @param hasChildren - Whether the node has children
 * @param isFolded - Whether the node's children are hidden
 * @param color - Optional color override (from node's rules.color)
 */
export function getFoldMarker(
  hasChildren: boolean,
  isFolded: boolean,
  color?: string,
): StatusIcon {
  if (!hasChildren) {
    return color ? { ...EMPTY_MARKER, color } : EMPTY_MARKER;
  }
  const marker = isFolded ? FOLDED_MARKER : UNFOLDED_MARKER;
  return color ? { ...marker, color } : marker;
}

// =============================================================================
// Task Status Icons (Ballot Box Style)
// =============================================================================

/**
 * Get status icon for tasks with color.
 *
 * Status values: todo, wip, blocked, done, dropped
 * See km-core/src/types.ts for TaskStatus type.
 *
 * Ballot box style icons:
 * - todo: ☐ (ballot box, white)
 * - wip: ☐ (ballot box, orange/yellow)
 * - blocked: ☒ (ballot box with X, red)
 * - done: ☑ (ballot box with check, green)
 * - dropped: ☒ (ballot box with X, gray)
 */
export function getStatusIcon(status: string | null | undefined): StatusIcon {
  switch (status) {
    case "todo":
      return { char: "\u2610", color: "white" }; // ☐ ballot box
    case "wip":
      return { char: "\u2610", color: "yellow" }; // ☐ ballot box (orange/yellow)
    case "blocked":
      return { char: "\u2612", color: "red" }; // ☒ ballot box with X
    case "done":
      return { char: "\u2611", color: "green" }; // ☑ ballot box with check
    case "dropped":
      return { char: "\u2612", color: "gray" }; // ☒ ballot box with X
    case null:
    case undefined:
      // Missing status - show red warning triangle
      return { char: "\u26A0", color: "red" }; // warning ⚠
    default:
      // Invalid/unknown status - show the actual value with inverted colors
      // This helps debug what invalid status was received
      return {
        char: (status as string).charAt(0),
        color: "black",
        backgroundColor: "white",
      };
  }
}

/**
 * Get type icon for non-task nodes.
 *
 * Note: code and quote blocks don't need icons - rich text rendering
 * handles their visual distinction (backticks for code, italics for quotes).
 */
export function getTypeIcon(type: string): string {
  switch (type) {
    case "folder":
      return "\uD83D\uDCC1"; // folder 📁
    case "file":
      return "\uD83D\uDCC4"; // file 📄
    case "section":
      return "#"; // hash for section
    case "paragraph":
    case "code":
    case "quote":
      return ""; // empty - rely on rich text rendering
    default:
      return "\u00B7"; // middle dot · for list items
  }
}

/**
 * Default filled circle icon for nodes with color but no status
 */
export const COLORED_CIRCLE: StatusIcon = {
  char: "\u25CF", // filled circle ●
  color: "white",
};

/**
 * Small bullet for non-task items without color
 */
export const SMALL_BULLET: StatusIcon = {
  char: "\u00B7", // middle dot ·
  color: "gray",
};

/**
 * Get a node icon with color override support.
 *
 * For nodes that define a color (via rules.color or inherited):
 * - If it's a task: use the status icon shape but with the inherited color
 * - If it's not a task: show a filled circle with the inherited color
 *
 * For non-task items without color, show a small bullet.
 *
 * @param status - Task status (or null/undefined for non-tasks)
 * @param inheritedColor - Color from node's rules or ancestors
 * @param isTask - Whether this node is a task (helps distinguish null status)
 * @returns StatusIcon with appropriate char and color
 */
export function getNodeIcon(
  status: string | null | undefined,
  inheritedColor?: string,
  isTask = true,
): StatusIcon {
  // For tasks, get the base status icon
  if (status !== null && status !== undefined) {
    const baseIcon = getStatusIcon(status);

    // If there's an inherited color, override the icon color
    if (inheritedColor) {
      return {
        char: baseIcon.char,
        color: inheritedColor,
        backgroundColor: baseIcon.backgroundColor,
      };
    }

    return baseIcon;
  }

  // For non-tasks with an inherited color, show a colored circle
  if (inheritedColor) {
    return {
      char: COLORED_CIRCLE.char,
      color: inheritedColor,
    };
  }

  // Non-task without color - show small bullet
  if (!isTask) {
    return SMALL_BULLET;
  }

  // Task with null/undefined status - show warning
  return getStatusIcon(status);
}
