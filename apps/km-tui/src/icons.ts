/**
 * Icon Utilities
 *
 * Status and type icons for nodes.
 * Used by both CLI commands and TUI components.
 */

import { KNode, type ItemData } from "@km/core"

/** Regex for sigil names: strings starting with @, +, or # (e.g., @next, +project, #tag) */
const SIGIL_RE = /^[@#+]/

/** Check if a string is a sigil name */
export function isSigilName(name: string | null | undefined): boolean {
  return name != null && SIGIL_RE.test(name)
}

export interface StatusIcon {
  char: string
  color: string
  backgroundColor?: string
}

// =============================================================================
// Fold Markers (New Cards Style)
// =============================================================================

/** Marker for nodes with children that are hidden (folded) - BIG */
export const FOLDED_MARKER: StatusIcon = {
  char: "\u25B8", // ▸ small right-pointing triangle (single-width)
  color: "$fg",
}

/** Marker for nodes with children that are visible (unfolded) - MEDIUM */
const UNFOLDED_MARKER: StatusIcon = {
  char: "\u2022", // • bullet
  color: "$fg",
}

/** Marker for nodes without children - TINY */
const EMPTY_MARKER: StatusIcon = {
  char: "\u00B7", // · middle dot
  color: "$muted",
}

/**
 * Get fold marker based on children state and fold state.
 *
 * @param hasChildren - Whether the node has children
 * @param isFolded - Whether the node's children are hidden
 * @param color - Optional color override (from node's rules.color)
 */
export function getFoldMarker(hasChildren: boolean, isFolded: boolean, color?: string): StatusIcon {
  if (!hasChildren) {
    return color ? { ...EMPTY_MARKER, color } : EMPTY_MARKER
  }
  const marker = isFolded ? FOLDED_MARKER : UNFOLDED_MARKER
  return color ? { ...marker, color } : marker
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
 * Task status icons (width-1 characters for consistent terminal rendering):
 * - todo: □ (white square, white)
 * - wip: □ (white square, orange/yellow)
 * - blocked: ✗ (ballot X, red)
 * - done: ✓ (check mark, green)
 * - dropped: ✗ (ballot X, gray)
 *
 * Note: Ballot box characters (☐☑☒) have inconsistent width across terminals
 * (some render as 1, others as 2). Using simpler characters for reliability.
 */
export function getStatusIcon(status: string | null | undefined): StatusIcon {
  switch (status) {
    case "todo":
      return { char: "\u25A1", color: "$fg" } // □ white square
    case "wip":
      return { char: "\u25A1", color: "$warning" } // □ white square (orange/yellow)
    case "blocked":
      return { char: "\u2717", color: "$error" } // ✗ ballot X
    case "done":
      return { char: "\u2713", color: "$success" } // ✓ check mark
    case "dropped":
      return { char: "\u2717", color: "$muted" } // ✗ ballot X
    case null:
    case undefined:
      // Missing status - show red warning triangle
      return { char: "\u26A0", color: "$error" } // warning ⚠
    default:
      // Invalid/unknown status - show the actual value with inverted colors
      // This helps debug what invalid status was received
      return {
        char: String(status).charAt(0),
        color: "$selection",
        backgroundColor: "$fg",
      }
  }
}

/**
 * Get type icon for non-task nodes.
 *
 * Note: code and quote blocks don't need icons - rich text rendering
 * handles their visual distinction (backticks for code, italics for quotes).
 */
export function getTypeIcon(type: string, fstype?: string, item?: ItemData): string {
  if (KNode.isOutline({ type, item })) {
    switch (fstype) {
      case "folder":
        return "\uD83D\uDCC1" // folder 📁
      case "file":
      case "mdfile":
        return "\uD83D\uDCC4" // file 📄
      case "mdsection":
        return "#" // hash for section
      default:
        return "\u00B7" // middle dot · for other outline items
    }
  }
  switch (type) {
    case "p":
    case "code":
    case "quote":
      return "" // empty - rely on rich text rendering
    default:
      return "\u00B7" // middle dot · for list items
  }
}

// =============================================================================
// Type-Specific Bullets (Nerdfont Style)
// =============================================================================

/**
 * Get a type-specific bullet icon for a node.
 *
 * Nerdfont visual design: type-specific icons replace fold markers.
 * Tasks return null because they use getStatusIcon for their checkbox bullet.
 *
 * @param node - The node to get a bullet for
 * @param hasChildren - Whether the node has children (affects list item style)
 * @returns StatusIcon with char and color, or null for tasks
 */
export function getTypeBullet(
  node: { type: string; item?: ItemData; fstype?: string; task_status?: string | null; task_marker?: string },
  hasChildren: boolean,
): StatusIcon | null {
  // Tasks don't use a type bullet — their checkbox serves as the bullet
  if (node.item?.task?.status != null || node.item?.task?.marker !== undefined) return null

  if (KNode.isOutline(node)) {
    switch (node.fstype) {
      case "folder":
        return { char: "\uF114", color: "$fg" } //  folder-o (nerdfont)
      case "file":
      case "mdfile":
        return { char: "\uF0F6", color: "$fg" } //  file-text-o (nerdfont)
      case "mdsection":
        return { char: "\u00A7", color: "$fg" } // § section sign
      default:
        return { char: "\u00B7", color: "$muted" } // · middle dot
    }
  }

  if (KNode.isListItem(node)) {
    // List items with children get a bullet
    if (hasChildren) return { char: "\u2022", color: "$fg" } // • bullet
    return { char: "\u00B7", color: "$muted" } // · middle dot
  }

  // Leaf items: p, code, quote, etc.
  return { char: "\u00B7", color: "$muted" } // · middle dot
}

// =============================================================================
// WorkFlowy-style Circle Bullets
// =============================================================================

/**
 * Get circle bullet based on children state and fold state.
 * - Has children + folded: ● (filled circle, white) — content hidden inside
 * - Has children + unfolded: ○ (hollow circle, white) — content visible below
 * - No children: · (middle dot, gray) — minimal leaf indicator
 */
export function getCircleBullet(hasChildren: boolean, isFolded = false): StatusIcon {
  if (hasChildren) {
    if (isFolded) {
      return { char: "\u25CF", color: "$fg" } // ● filled circle
    }
    return { char: "\u25CB", color: "$fg" } // ○ hollow circle
  }
  return { char: "\u00B7", color: "$muted" } // · middle dot
}

// =============================================================================
// Column Header Icon (shared across views)
// =============================================================================

/**
 * Get the bullet icon for a column header based on icon style.
 *
 * Shared by CardColumn, ColumnsView, and MemoizedColumnHeader to avoid
 * duplicating the icon-style branching logic in each view component.
 *
 * @param node - Column header node (for type-based icon in nerdfont style)
 * @param iconStyle - Current icon style setting
 * @param isVirtual - Whether this is a virtual body column
 * @param ownColor - Optional color override from node rules
 */
export function getColumnHeaderIcon(
  node: { type: string; fstype?: string; task_status?: string | null; task_marker?: string },
  iconStyle: string,
  isVirtual: boolean,
  ownColor?: string,
): StatusIcon {
  if (isVirtual) return { char: "\u00B7", color: "$muted" } // · middle dot

  const baseIcon =
    iconStyle === "workflowy"
      ? getCircleBullet(true, false) // columns always expanded → ○
      : iconStyle === "nerdfont"
        ? (getTypeBullet(node, true) ?? { char: "\u00B7", color: "$muted" as const })
        : getFoldMarker(true, false) // regular: unfolded marker •
  return ownColor ? { ...baseIcon, color: ownColor } : baseIcon
}

/**
 * Default filled circle icon for nodes with color but no status
 */
const COLORED_CIRCLE: StatusIcon = {
  char: "\u25CF", // filled circle ●
  color: "$fg",
}

/**
 * Small bullet for non-task items without color
 */
const SMALL_BULLET: StatusIcon = {
  char: "\u00B7", // middle dot ·
  color: "$muted",
}

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
export function getNodeIcon(status: string | null | undefined, inheritedColor?: string, isTask = true): StatusIcon {
  // For tasks, get the base status icon
  if (status !== null && status !== undefined) {
    const baseIcon = getStatusIcon(status)

    // If there's an inherited color, override the icon color
    if (inheritedColor) {
      return {
        char: baseIcon.char,
        color: inheritedColor,
        backgroundColor: baseIcon.backgroundColor,
      }
    }

    return baseIcon
  }

  // For non-tasks with an inherited color, show a colored circle
  if (inheritedColor) {
    return {
      char: COLORED_CIRCLE.char,
      color: inheritedColor,
    }
  }

  // Non-task without color - show small bullet
  if (!isTask) {
    return SMALL_BULLET
  }

  // Task with null/undefined status - show warning
  return getStatusIcon(status)
}
