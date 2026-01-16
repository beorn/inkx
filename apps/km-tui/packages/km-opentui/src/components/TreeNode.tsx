/**
 * TreeNode Component for OpenTUI
 *
 * Recursive component for rendering hierarchical node trees.
 * Used by ListView, ColumnsView, and TabsView.
 *
 * Rich task display includes:
 * - Status icon (colored circles from shared utilities)
 * - Priority badge (colored by level)
 * - Due date with urgency indication
 * - Backlinks indicator
 * - Refs count
 */

import type { ReactElement, ReactNode } from "react";
import { getStatusIcon } from "@km/ink";
import { renderPlain } from "@km/sh-app";
import type { TaskStatus } from "@km/board";

export interface TreeNodeData {
  id: string;
  title: string;
  children?: TreeNodeData[];
  isTask?: boolean;
  taskStatus?: TaskStatus;
  childCount?: number;
  color?: string;
  // Rich task display fields
  priority?: number;
  dueDate?: string;
  hasBacklinks?: boolean;
  refsCount?: number;
}

export interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  width: number;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isFolded?: boolean;
  maxDepth?: number;
  variant?: "compact" | "wide";
}

// Priority colors (P0-P5 style, using 1-5 internally)
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
    return { text: `${dateStr} (${Math.abs(diffDays)}d ago)`, color: "red" };
  } else if (diffDays === 0) {
    return { text: `${dateStr} (today)`, color: "red" };
  } else if (diffDays <= 3) {
    return { text: `${dateStr} (${diffDays}d)`, color: "yellow" };
  } else {
    return { text: dateStr, color: "gray" };
  }
}

export function TreeNode({
  node,
  depth,
  width,
  isSelected,
  isMultiSelected = false,
  isFolded = false,
  maxDepth = 3,
  variant = "wide",
}: TreeNodeProps): ReactElement {
  const hasChildren =
    (node.children?.length ?? 0) > 0 || (node.childCount ?? 0) > 0;
  const indent = "  ".repeat(depth);
  const foldIndicator = hasChildren ? (isFolded ? "▶" : "▼") : " ";

  // Get status icon (colored circle) for tasks
  const statusIcon = node.isTask ? getStatusIcon(node.taskStatus) : null;

  // Clean title using renderPlain to strip [[wikilinks]], [fields::], etc.
  const cleanTitle = renderPlain(node.title);

  const childCountDisplay =
    hasChildren && isFolded
      ? ` (${(node.children?.length ?? 0) || node.childCount})`
      : "";

  // Selection colors: both cursor selection and multi-selection use cyan background
  const hasSelection = isSelected || isMultiSelected;
  const bgColor = hasSelection ? "cyan" : undefined;
  const textColor = hasSelection ? "black" : undefined;

  // Dim done/dropped tasks
  const isDoneOrDropped =
    node.isTask &&
    (node.taskStatus === "done" || node.taskStatus === "dropped");

  // Priority color (check for both null and undefined)
  const hasPriority = node.priority != null;
  const priorityColor =
    hasPriority && node.priority !== undefined
      ? getPriorityColor(node.priority)
      : undefined;

  // Format due date if present
  const dueDateInfo = node.dueDate ? formatDueDate(node.dueDate) : null;

  // Build metadata suffix for the first line
  const metadataParts: string[] = [];
  if (dueDateInfo) {
    metadataParts.push(`Due:${dueDateInfo.text}`);
  }
  if (node.hasBacklinks) {
    metadataParts.push("<-");
  }
  if (node.refsCount !== undefined && node.refsCount > 0) {
    metadataParts.push(`@${node.refsCount}`);
  }

  // Calculate available width for title
  const statusIconLen = statusIcon ? 2 : 0; // icon char + space
  const prefixLen =
    indent.length +
    2 + // fold indicator + space
    statusIconLen +
    (hasPriority ? `[P${node.priority}] `.length : 0);
  const suffixLen = childCountDisplay.length;
  const availableWidth = Math.max(10, width - prefixLen - suffixLen);

  // Truncate title if needed
  const title =
    cleanTitle.length > availableWidth
      ? cleanTitle.slice(0, availableWidth - 1) + "…"
      : cleanTitle;

  // Build children nodes
  const childNodes: ReactNode[] = [];
  if (hasChildren && !isFolded && depth < maxDepth && node.children) {
    const maxChildren = variant === "compact" ? 8 : Infinity;
    const visibleChildren = node.children.slice(0, maxChildren);
    const hiddenCount = (node.children?.length ?? 0) - visibleChildren.length;

    for (const child of visibleChildren) {
      childNodes.push(
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          width={width}
          isSelected={false}
          isFolded={false}
          maxDepth={maxDepth}
          variant={variant}
        />,
      );
    }

    if (hiddenCount > 0) {
      childNodes.push(
        <text key="more" color="gray">
          {"  ".repeat(depth + 1)} +{hiddenCount} more
        </text>,
      );
    }
  }

  // For compact display (in wide mode with metadata), show on two lines
  const hasMetadata = metadataParts.length > 0 && variant === "wide";

  if (hasMetadata) {
    // Two-line display for wide variant with metadata
    return (
      <box flexDirection="column" width={width}>
        {/* First line: fold + status icon + priority + title + child count */}
        <box flexDirection="row" backgroundColor={bgColor}>
          <text color={textColor} dim={isDoneOrDropped}>
            {indent}
            {foldIndicator}{" "}
          </text>
          {/* Status icon (colored circle) */}
          {statusIcon && (
            <text color={hasSelection ? "black" : statusIcon.color}>
              {statusIcon.char}{" "}
            </text>
          )}
          {hasPriority && node.priority !== undefined && (
            <text color={hasSelection ? "black" : priorityColor} bold>
              [{getPriorityLabel(node.priority)}]{" "}
            </text>
          )}
          <text color={textColor} dim={isDoneOrDropped}>
            {title}
          </text>
          {childCountDisplay && (
            <text color={hasSelection ? "black" : "gray"}>
              {childCountDisplay}
            </text>
          )}
        </box>
        {/* Second line: metadata */}
        <box flexDirection="row">
          <text color="gray" dim>
            {indent}
            {"  "}
          </text>
          {dueDateInfo && (
            <text color={hasSelection ? "gray" : dueDateInfo.color} dim>
              Due: {dueDateInfo.text}
            </text>
          )}
          {node.hasBacklinks && (
            <text color="gray" dim>
              {dueDateInfo ? "  " : ""}
              {"<-"}
            </text>
          )}
          {node.refsCount !== undefined && node.refsCount > 0 && (
            <text color="gray" dim>
              {dueDateInfo || node.hasBacklinks ? "  " : ""}@{node.refsCount}
            </text>
          )}
        </box>
        {childNodes}
      </box>
    );
  }

  // Single-line display (compact variant or no metadata)
  return (
    <box flexDirection="column" width={width}>
      <box flexDirection="row" backgroundColor={bgColor}>
        <text color={textColor} dim={isDoneOrDropped}>
          {indent}
          {foldIndicator}{" "}
        </text>
        {/* Status icon (colored circle) */}
        {statusIcon && (
          <text color={hasSelection ? "black" : statusIcon.color}>
            {statusIcon.char}{" "}
          </text>
        )}
        {hasPriority && node.priority !== undefined && (
          <text color={hasSelection ? "black" : priorityColor} bold>
            [{getPriorityLabel(node.priority)}]{" "}
          </text>
        )}
        <text color={textColor} dim={isDoneOrDropped}>
          {title}
        </text>
        {childCountDisplay && (
          <text color={hasSelection ? "black" : "gray"}>
            {childCountDisplay}
          </text>
        )}
        {/* Compact metadata on same line */}
        {variant === "compact" && metadataParts.length > 0 && (
          <text color={hasSelection ? "black" : "gray"} dim>
            {" "}
            [{metadataParts.join(" ")}]
          </text>
        )}
      </box>
      {childNodes}
    </box>
  );
}

export default TreeNode;
