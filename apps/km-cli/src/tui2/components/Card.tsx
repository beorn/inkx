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
  childCount,
  color,
  icon,
  isFolded,
  taskStatus,
}: CardProps) {
  const borderColor = isSelected ? "cyan" : color || "white";
  const textColor = isSelected ? "cyan" : "white";

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

  return (
    <box
      border
      borderStyle="single"
      borderColor={borderColor}
      width="100%"
      paddingLeft={1}
      paddingRight={1}
    >
      <text color={textColor}>
        {displayTitle}
        {suffix}
      </text>
    </box>
  );
}

export default Card;
