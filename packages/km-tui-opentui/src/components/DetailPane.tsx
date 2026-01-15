/**
 * DetailPane Component
 *
 * Right sidebar showing detailed information about the selected card.
 * Displays full title, status, priority, due dates, content, and child count.
 */

import type { Node } from "@km/core";
import type { TaskStatus } from "../types.ts";

// Status display configuration per design system
const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; label: string; color: string }
> = {
  todo: { icon: "[ ]", label: "Todo", color: "gray" },
  wip: { icon: "[/]", label: "In Progress", color: "yellow" },
  blocked: { icon: "[!]", label: "Blocked", color: "red" },
  done: { icon: "[x]", label: "Done", color: "green" },
  dropped: { icon: "[-]", label: "Dropped", color: "gray" },
};

// Priority display (P0-P5)
function formatPriority(priority: number | undefined): string | null {
  if (priority === undefined || priority === null) return null;
  return `P${priority}`;
}

// Format date for display
function formatDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  return dateStr; // Already in YYYY-MM-DD format
}

interface DetailPaneProps {
  node: Node | null;
  childCount: number;
  width?: number;
}

export function DetailPane({ node, childCount, width = 40 }: DetailPaneProps) {
  // Content width inside the pane (accounting for padding and border)
  const contentWidth = width - 4;

  // Helper to truncate text to fit width
  const truncate = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + "...";
  };

  // Helper to wrap text into multiple lines
  const wrapText = (text: string, maxLen: number): string[] => {
    const lines: string[] = [];
    const words = text.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxLen) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    return lines;
  };

  // Empty state when no node selected
  if (!node) {
    return (
      <box
        width={width}
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        borderLeft
        borderTop={false}
        borderRight={false}
        borderBottom={false}
      >
        <box paddingLeft={1} paddingTop={1}>
          <text dimColor>No item selected</text>
        </box>
      </box>
    );
  }

  // Get display values
  const title = node.title || node.content || "(untitled)";
  const status = node.task_status as TaskStatus | undefined;
  const statusConfig = status ? STATUS_CONFIG[status] : null;
  const priority = formatPriority(node.priority);
  const dueDate = formatDate(node.due_date);
  const scheduledDate = formatDate(node.scheduled_date);
  const content = node.content || "";

  // Wrap title for display
  const titleLines = wrapText(title, contentWidth);

  // Wrap content for display (limit to 10 lines)
  const contentLines = content
    ? wrapText(content, contentWidth).slice(0, 10)
    : [];
  const contentTruncated = content
    ? wrapText(content, contentWidth).length > 10
    : false;

  return (
    <box
      width={width}
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      borderLeft
      borderTop={false}
      borderRight={false}
      borderBottom={false}
    >
      {/* Header */}
      <box paddingLeft={1} paddingTop={1}>
        <text color="yellow" bold>
          Details
        </text>
      </box>

      {/* Separator */}
      <box paddingLeft={1}>
        <text dimColor>{"─".repeat(contentWidth)}</text>
      </box>

      {/* Title */}
      <box paddingLeft={1} paddingTop={1} flexDirection="column">
        <text dimColor>Title</text>
        {titleLines.map((line, idx) => (
          <text key={idx} bold>
            {line}
          </text>
        ))}
      </box>

      {/* Status */}
      {statusConfig && (
        <box paddingLeft={1} paddingTop={1}>
          <text dimColor>Status: </text>
          <text
            color={statusConfig.color as "gray" | "yellow" | "red" | "green"}
          >
            {statusConfig.icon} {statusConfig.label}
          </text>
        </box>
      )}

      {/* Priority */}
      {priority && (
        <box paddingLeft={1}>
          <text dimColor>Priority: </text>
          <text color="magenta" bold>
            {priority}
          </text>
        </box>
      )}

      {/* Due Date */}
      {dueDate && (
        <box paddingLeft={1}>
          <text dimColor>Due: </text>
          <text color="yellow">{dueDate}</text>
        </box>
      )}

      {/* Scheduled Date */}
      {scheduledDate && (
        <box paddingLeft={1}>
          <text dimColor>Scheduled: </text>
          <text>{scheduledDate}</text>
        </box>
      )}

      {/* Child count / Subtasks */}
      {childCount > 0 && (
        <box paddingLeft={1}>
          <text dimColor>Subtasks: </text>
          <text>{childCount}</text>
        </box>
      )}

      {/* Separator before content */}
      {contentLines.length > 0 && (
        <>
          <box paddingLeft={1} paddingTop={1}>
            <text dimColor>{"─".repeat(contentWidth)}</text>
          </box>

          {/* Content */}
          <box paddingLeft={1} paddingTop={1} flexDirection="column">
            <text dimColor>Content</text>
            {contentLines.map((line, idx) => (
              <text key={idx}>{line}</text>
            ))}
            {contentTruncated && <text dimColor>...</text>}
          </box>
        </>
      )}

      {/* Node type and ID (metadata) */}
      <box paddingLeft={1} paddingTop={1}>
        <text dimColor>
          {node.type} | {truncate(node.id, contentWidth - node.type.length - 3)}
        </text>
      </box>

      {/* Keyboard hint */}
      <box flexGrow={1} />
      <box paddingLeft={1} paddingBottom={1}>
        <text dimColor>Press i to close</text>
      </box>
    </box>
  );
}

export default DetailPane;
