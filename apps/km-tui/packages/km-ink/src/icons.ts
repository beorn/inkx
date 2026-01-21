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

/**
 * Get status icon for tasks with color.
 *
 * Status values: todo, wip, blocked, done, dropped
 * See km-core/src/types.ts for TaskStatus type.
 */
export function getStatusIcon(status: string | null | undefined): StatusIcon {
  switch (status) {
    case "todo":
      return { char: "\u25CB", color: "gray" }; // empty circle ○
    case "wip":
      return { char: "\u25D0", color: "yellow" }; // half circle ◐
    case "blocked":
      return { char: "\u2298", color: "red" }; // circled slash ⊘
    case "done":
      return { char: "\u2713", color: "green" }; // checkmark ✓
    case "dropped":
      return { char: "\u2205", color: "gray" }; // empty set ∅
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
