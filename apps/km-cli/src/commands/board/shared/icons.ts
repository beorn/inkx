/**
 * Shared icon utilities for board TUI components
 */

/**
 * Get status icon for tasks
 */
export function getStatusIcon(status: string | null | undefined): string {
  switch (status) {
    case "done":
      return "\u2713"; // checkmark ✓
    case "in_progress":
      return "\u25D0"; // half circle ◐
    case "blocked":
      return "\u2298"; // circled slash ⊘
    case "waiting":
      return "\u25F7"; // clock ◷
    case "dropped":
      return "\u2205"; // empty set ∅
    default:
      return "\u25CB"; // empty circle ○
  }
}

/**
 * Get type icon for non-task nodes
 */
export function getTypeIcon(type: string): string {
  switch (type) {
    case "folder":
      return "\uD83D\uDCC1"; // folder 📁
    case "file":
      return "\uD83D\uDCC4"; // file 📄
    case "section":
      return "\u00A7"; // section §
    case "paragraph":
      return "\u00B6"; // pilcrow ¶
    case "code":
      return "\u2328"; // keyboard ⌨
    case "quote":
      return "\u275D"; // quote ❝
    default:
      return "\u2022"; // bullet •
  }
}
