/**
 * Card Component
 *
 * Stateless card rendering. Receives all data via props.
 * No hooks, no store access - pure presentation.
 */

import type { CardProps, TaskStatus } from "../types.ts";

// Task status indicators
const STATUS_ICONS: Record<TaskStatus, string> = {
  todo: "[ ]",
  wip: "[/]",
  blocked: "[!]",
  done: "[x]",
  dropped: "[-]",
};

export function Card({
  title,
  isSelected,
  isMultiSelected,
  childCount,
  color,
  icon,
  isFolded,
  taskStatus,
}: CardProps) {
  // Multi-selected cards show with cyan background (same as cursor selection per design system)
  // isSelected = cursor position (current focus)
  // isMultiSelected = part of multi-selection set
  const hasSelection = isSelected || isMultiSelected;
  const borderColor = hasSelection ? "cyan" : color || "white";

  // Build title with optional task status and icon
  let displayTitle = title;
  if (taskStatus) {
    displayTitle = `${STATUS_ICONS[taskStatus]} ${displayTitle}`;
  }
  if (icon) {
    displayTitle = `${icon} ${displayTitle}`;
  }

  // Show child count and fold indicator
  let suffix = "";
  if (childCount > 0) {
    suffix = isFolded ? ` [+${childCount}]` : ` (${childCount})`;
  }

  // Multi-selected cards use cyan background with black text (per design system)
  // Regular selected (cursor) cards use cyan border only
  if (isMultiSelected) {
    return (
      <box
        border
        borderStyle="single"
        borderColor={borderColor}
        width="100%"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor="cyan"
      >
        <text color="black">
          {displayTitle}
          {suffix}
        </text>
      </box>
    );
  }

  return (
    <box
      border
      borderStyle="single"
      borderColor={borderColor}
      width="100%"
      paddingLeft={1}
      paddingRight={1}
    >
      <text color={isSelected ? "cyan" : "white"}>
        {displayTitle}
        {suffix}
      </text>
    </box>
  );
}

export default Card;
