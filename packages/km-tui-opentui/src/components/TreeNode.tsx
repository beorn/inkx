/**
 * TreeNode Component for OpenTUI
 *
 * Recursive component for rendering hierarchical node trees.
 * Used by ListView, ColumnsView, and TabsView.
 *
 * Simplified version that focuses on structure - detailed styling
 * and features can be added incrementally.
 */

import type { ReactElement, ReactNode } from "react";

export interface TreeNodeData {
  id: string;
  title: string;
  children?: TreeNodeData[];
  isTask?: boolean;
  taskStatus?: "todo" | "wip" | "blocked" | "done" | "dropped";
  childCount?: number;
  color?: string;
}

export interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  width: number;
  isSelected: boolean;
  isFolded?: boolean;
  maxDepth?: number;
  variant?: "compact" | "wide";
}

// Task status markers
function getStatusMarker(
  status?: "todo" | "wip" | "blocked" | "done" | "dropped",
): string {
  switch (status) {
    case "todo":
      return "[ ]";
    case "wip":
      return "[/]";
    case "blocked":
      return "[!]";
    case "done":
      return "[x]";
    case "dropped":
      return "[-]";
    default:
      return "";
  }
}

export function TreeNode({
  node,
  depth,
  width,
  isSelected,
  isFolded = false,
  maxDepth = 3,
  variant = "wide",
}: TreeNodeProps): ReactElement {
  const hasChildren = (node.children?.length ?? 0) > 0 || (node.childCount ?? 0) > 0;
  const indent = "  ".repeat(depth);
  const foldIndicator = hasChildren ? (isFolded ? "▶" : "▼") : " ";
  const statusMarker = node.isTask ? getStatusMarker(node.taskStatus) : "";
  const childCountDisplay =
    hasChildren && isFolded
      ? ` (${node.children?.length ?? node.childCount})`
      : "";

  // Calculate available width for title
  const prefixLen = indent.length + 2 + (statusMarker ? statusMarker.length + 1 : 0);
  const suffixLen = childCountDisplay.length;
  const availableWidth = Math.max(10, width - prefixLen - suffixLen);

  // Truncate title if needed
  const title =
    node.title.length > availableWidth
      ? node.title.slice(0, availableWidth - 1) + "…"
      : node.title;

  // Selection colors
  const bgColor = isSelected ? "cyan" : undefined;
  const textColor = isSelected ? "black" : undefined;

  // Dim done/dropped tasks
  const isDoneOrDropped =
    node.isTask && (node.taskStatus === "done" || node.taskStatus === "dropped");

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

  return (
    <box flexDirection="column" width={width}>
      <text
        backgroundColor={bgColor}
        color={textColor}
        dim={isDoneOrDropped}
      >
        {indent}
        {foldIndicator} {statusMarker && `${statusMarker} `}
        {title}
        {childCountDisplay && <text color="gray">{childCountDisplay}</text>}
      </text>
      {childNodes}
    </box>
  );
}

export default TreeNode;
