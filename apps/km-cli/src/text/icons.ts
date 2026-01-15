/**
 * Icon Utilities (Layer 1 - Shared)
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
    default:
      // Unknown/null/undefined status is an error - show with inverted colors
      return { char: "?", color: "black", backgroundColor: "white" };
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
