/**
 * Icon Utilities (Layer 1 - Shared)
 *
 * Status and type icons for nodes.
 * Used by both CLI commands and TUI components.
 */

export interface StatusIcon {
  char: string;
  color: string;
}

/**
 * Get status icon for tasks with color.
 *
 * Status values: open, done, wip, blocked, waiting, dropped
 */
export function getStatusIcon(status: string | null | undefined): StatusIcon {
  switch (status) {
    case "done":
      return { char: "\u2713", color: "green" }; // checkmark ✓
    case "wip":
      return { char: "\u25D0", color: "yellow" }; // half circle ◐
    case "blocked":
      return { char: "\u2298", color: "red" }; // circled slash ⊘
    case "waiting":
      return { char: "\u25F7", color: "blue" }; // clock ◷
    case "dropped":
      return { char: "\u2205", color: "gray" }; // empty set ∅
    default:
      return { char: "\u25CB", color: "gray" }; // empty circle ○
  }
}

/**
 * Get type icon for non-task nodes.
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
      return ""; // empty - no icon
    case "code":
      return "`"; // backtick for code
    case "quote":
      return '"'; // quote mark
    default:
      return "\u00B7"; // middle dot · for list items
  }
}
