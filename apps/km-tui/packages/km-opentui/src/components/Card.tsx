/**
 * Card Component
 *
 * Stateless card rendering. Receives all data via props.
 * No hooks, no store access - pure presentation.
 *
 * Rich task display includes:
 * - Status icon (colored circles from shared utilities)
 * - Priority badge (colored by level)
 * - Due date with urgency indication
 * - Backlinks indicator
 * - Refs count
 */

import type { CardProps } from "../types.ts";
import { getStatusIcon } from "@km/ink";
import { renderPlain } from "@km/sh-app";

// Priority colors (P0-P5 style, using 1-5 internally)
// P0/1: critical/high (red/magenta)
// P2: medium (yellow)
// P3: low (green)
// P4/5: backlog (gray)
function getPriorityColor(priority: number): string {
  switch (priority) {
    case 0:
    case 1:
      return "red";
    case 2:
      return "magenta";
    case 3:
      return "yellow";
    case 4:
      return "green";
    default:
      return "gray";
  }
}

function getPriorityLabel(priority: number): string {
  return `P${priority}`;
}

/**
 * Format due date for display with urgency indication
 * Returns: { text: string, color: string }
 */
function formatDueDate(dueDate: string): { text: string; color: string } {
  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffDays = Math.floor(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Format the date as "Mon DD"
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const dateStr = `${monthNames[due.getMonth()]} ${due.getDate()}`;

  if (diffDays < 0) {
    // Overdue - red
    return { text: `${dateStr} (${Math.abs(diffDays)}d ago)`, color: "red" };
  } else if (diffDays === 0) {
    // Today - red
    return { text: `${dateStr} (today)`, color: "red" };
  } else if (diffDays <= 3) {
    // Within 3 days - yellow
    return { text: `${dateStr} (${diffDays}d)`, color: "yellow" };
  } else {
    // Future - gray
    return { text: dateStr, color: "gray" };
  }
}

export function Card({
  title,
  isSelected,
  isMultiSelected,
  childCount,
  color,
  icon,
  isFolded,
  taskStatus,
  priority,
  dueDate,
  hasBacklinks,
  refsCount,
}: CardProps) {
  // Multi-selected cards show with cyan background (same as cursor selection per design system)
  // isSelected = cursor position (current focus)
  // isMultiSelected = part of multi-selection set
  const hasSelection = isSelected || isMultiSelected;
  // TUI1 uses: cyanBright for selected, blackBright (gray) for unselected
  const borderColor = hasSelection ? "cyanBright" : color || "blackBright";

  // Get status icon (colored circle) for tasks
  const statusIcon = taskStatus ? getStatusIcon(taskStatus) : null;

  // Clean title using renderPlain to strip [[wikilinks]], [fields::], etc.
  const cleanTitle = renderPlain(title);

  // Show child count and fold indicator
  let childSuffix = "";
  if (childCount > 0) {
    childSuffix = isFolded ? ` [+${childCount}]` : ` (${childCount})`;
  }

  // Format due date if present
  const dueDateInfo = dueDate ? formatDueDate(dueDate) : null;

  // Check for priority (both null and undefined)
  const hasPriority = priority != null;

  // Build metadata line (second line if any metadata present)
  const hasMetadata = hasPriority || dueDate || hasBacklinks;

  // Determine text color based on selection and task status
  const isDoneOrDropped = taskStatus === "done" || taskStatus === "dropped";

  // For selection, use cyan background with black text (per design system)
  if (hasSelection) {
    return (
      <box
        border
        borderStyle="single"
        borderColor={borderColor}
        width="100%"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor="cyan"
        flexDirection="column"
      >
        {/* First line: status icon + priority badge + title */}
        <box flexDirection="row">
          {/* Status icon (colored circle) */}
          {statusIcon && <text color="black">{statusIcon.char} </text>}
          {/* Custom icon if provided */}
          {icon && !statusIcon && <text color="black">{icon} </text>}
          {hasPriority && (
            <text color="black" bold>
              [{getPriorityLabel(priority)}]{" "}
            </text>
          )}
          <text color="black" dim={isDoneOrDropped}>
            {cleanTitle}
            {childSuffix}
          </text>
        </box>
        {/* Second line: metadata (due date, backlinks) */}
        {hasMetadata && (
          <box flexDirection="row">
            {dueDateInfo && (
              <text color="black" dim>
                Due: {dueDateInfo.text}
              </text>
            )}
            {hasBacklinks && (
              <text color="black" dim>
                {dueDateInfo ? "  " : ""}
                {"<-"}
              </text>
            )}
            {refsCount !== undefined && refsCount > 0 && (
              <text color="black" dim>
                {dueDateInfo || hasBacklinks ? "  " : ""}@{refsCount}
              </text>
            )}
          </box>
        )}
      </box>
    );
  }

  // Non-selected state
  return (
    <box
      border
      borderStyle="single"
      borderColor={borderColor}
      width="100%"
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
    >
      {/* First line: status icon + priority badge + title */}
      <box flexDirection="row">
        {/* Status icon (colored circle) */}
        {statusIcon && <text color={statusIcon.color}>{statusIcon.char} </text>}
        {/* Custom icon if provided */}
        {icon && !statusIcon && <text color={color || "white"}>{icon} </text>}
        {hasPriority && (
          <text color={getPriorityColor(priority)} bold>
            [{getPriorityLabel(priority)}]{" "}
          </text>
        )}
        <text color="white" dim={isDoneOrDropped}>
          {cleanTitle}
          {childSuffix}
        </text>
      </box>
      {/* Second line: metadata (due date, backlinks, refs) */}
      {hasMetadata && (
        <box flexDirection="row">
          {dueDateInfo && (
            <text color={dueDateInfo.color} dim>
              Due: {dueDateInfo.text}
            </text>
          )}
          {hasBacklinks && (
            <text color="gray" dim>
              {dueDateInfo ? "  " : ""}
              {"<-"}
            </text>
          )}
          {refsCount !== undefined && refsCount > 0 && (
            <text color="gray" dim>
              {dueDateInfo || hasBacklinks ? "  " : ""}@{refsCount}
            </text>
          )}
        </box>
      )}
    </box>
  );
}

export default Card;
