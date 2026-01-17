/**
 * Detail Pane Component
 *
 * Shows full task details in a split-pane view on the right side of the board.
 * Displays content, fields, references, subtasks, and backlinks.
 */
import React from "react";
import { Box, Text } from "ink";
import type { KNode } from "@km/core";
import { getChildren, getBacklinks, getNode } from "@km/storage";
import { getNodeDisplayName } from "../state.ts";
import { renderRich } from "../text/index.ts";
import { wrapText } from "../layout/index.ts";

// Format date for display (e.g., "Jan 10" or "2026-01-10")
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    if (sameYear) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Status display with color
function getStatusDisplay(status?: string): { text: string; color: string } {
  switch (status) {
    case "done":
      return { text: "done", color: "green" };
    case "wip":
      return { text: "wip", color: "yellow" };
    case "blocked":
      return { text: "blocked", color: "red" };
    case "dropped":
      return { text: "dropped", color: "gray" };
    default:
      return { text: "todo", color: "blue" };
  }
}

// Priority display
function getPriorityDisplay(priority?: number): string {
  if (!priority) return "";
  return `P${priority}`;
}

// Get checkbox mark for subtask display (markdown style)
function getSubtaskCheckbox(status?: string): string {
  switch (status) {
    case "done":
      return "[x]";
    case "wip":
      return "[/]";
    case "blocked":
      return "[!]";
    case "dropped":
      return "[-]";
    default:
      return "[ ]";
  }
}

// Extract references from content
interface References {
  mentions: string[];
  tags: string[];
  projects: string[];
  wikilinks: string[];
}

function extractReferences(content: string | undefined): References {
  const refs: References = {
    mentions: [],
    tags: [],
    projects: [],
    wikilinks: [],
  };

  if (!content) return refs;

  // @mentions
  const mentionPattern = /@(\w+)/g;
  let match;
  while ((match = mentionPattern.exec(content)) !== null) {
    if (match[1] && !refs.mentions.includes(match[1])) {
      refs.mentions.push(match[1]);
    }
  }

  // #tags
  const tagPattern = /#(\w+)/g;
  while ((match = tagPattern.exec(content)) !== null) {
    if (match[1] && !refs.tags.includes(match[1])) {
      refs.tags.push(match[1]);
    }
  }

  // +projects
  const projectPattern = /\+(\w+)/g;
  while ((match = projectPattern.exec(content)) !== null) {
    if (match[1] && !refs.projects.includes(match[1])) {
      refs.projects.push(match[1]);
    }
  }

  // [[wikilinks]]
  const wikilinkPattern = /\[\[([^\]]+)\]\]/g;
  while ((match = wikilinkPattern.exec(content)) !== null) {
    if (match[1] && !refs.wikilinks.includes(match[1])) {
      refs.wikilinks.push(match[1]);
    }
  }

  return refs;
}

// Build project path (ancestors to root)
function getProjectPath(node: KNode): string[] {
  const path: string[] = [];
  let currentId = node.parent_id;

  while (currentId) {
    const parent = getNode(currentId);
    if (!parent) break;

    // Only include folders and files (not sections or the board root)
    if (parent.type === "folder" || parent.type === "file") {
      path.unshift(getNodeDisplayName(parent));
    }
    currentId = parent.parent_id;
  }

  return path;
}

export interface DetailPaneProps {
  node: Node;
  width: number;
  height: number;
}

export function DetailPane({
  node,
  width,
  height,
}: DetailPaneProps): React.ReactElement {
  const innerWidth = Math.max(10, width - 2);
  const title = getNodeDisplayName(node);

  // Get fields
  const statusInfo = getStatusDisplay(node.task_status);
  const dueDate = formatDate(node.due_date);
  const priority = getPriorityDisplay(node.priority);
  const assignedTo = node.assigned_to;

  // Get project path
  const projectPath = getProjectPath(node);

  // Extract references from content
  const refs = extractReferences(node.content);

  // Also check data for stored references
  const dataRefs = node.data as
    | { mentions?: string[]; tags?: string[]; projects?: string[] }
    | undefined;
  if (dataRefs?.mentions) {
    for (const m of dataRefs.mentions) {
      if (!refs.mentions.includes(m)) refs.mentions.push(m);
    }
  }
  if (dataRefs?.tags) {
    for (const t of dataRefs.tags) {
      if (!refs.tags.includes(t)) refs.tags.push(t);
    }
  }
  if (dataRefs?.projects) {
    for (const p of dataRefs.projects) {
      if (!refs.projects.includes(p)) refs.projects.push(p);
    }
  }

  // Get subtasks (children that are tasks)
  const children = getChildren(node.id);
  const subtasks = children.filter((c) => c.type === "task");

  // Get backlinks
  const backlinks = getBacklinks(node.id);
  const backlinkNodes: KNode[] = [];
  for (const link of backlinks) {
    const sourceNode = getNode(link.source_id);
    if (sourceNode) {
      backlinkNodes.push(sourceNode);
    }
  }

  // Calculate available lines for content
  // Reserve: title (2), separator (1), fields (~4), refs (~2), subtasks header+items, backlinks header+items
  const estimatedHeaderLines = 10;
  const maxSubtasks = 5;
  const maxBacklinks = 3;
  const contentLines = Math.max(
    1,
    height -
      estimatedHeaderLines -
      Math.min(subtasks.length, maxSubtasks) -
      Math.min(backlinkNodes.length, maxBacklinks) -
      4,
  );

  // Wrap content using shared utility
  const fullContent = node.content || "";
  const contentWidth = innerWidth - 2;
  // Render to styled text first, then wrap
  const styledContent = renderRich(fullContent);
  const wrappedContent = wrapText(styledContent, contentWidth);

  const displayContent = wrappedContent.slice(0, contentLines);
  const hasMoreContent = wrappedContent.length > contentLines;

  // Check if we have any references to show
  const hasRefs =
    refs.mentions.length > 0 ||
    refs.tags.length > 0 ||
    refs.projects.length > 0 ||
    refs.wikilinks.length > 0;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor="cyan"
    >
      {/* Title - let Ink handle wrapping naturally */}
      <Box paddingX={1} width={innerWidth}>
        <Text bold wrap="wrap">
          {title}
        </Text>
      </Box>

      {/* Separator - full width */}
      <Box paddingX={1}>
        <Text dimColor>{"─".repeat(innerWidth - 2)}</Text>
      </Box>

      {/* Fields */}
      <Box paddingX={1} flexDirection="row" gap={2}>
        <Text>
          <Text dimColor>Status: </Text>
          <Text color={statusInfo.color}>{statusInfo.text}</Text>
        </Text>
        {dueDate && (
          <Text>
            <Text dimColor>Due: </Text>
            <Text>{dueDate}</Text>
          </Text>
        )}
      </Box>

      {(priority || assignedTo) && (
        <Box paddingX={1} flexDirection="row" gap={2}>
          {priority && (
            <Text>
              <Text dimColor>Priority: </Text>
              <Text color="yellow">{priority}</Text>
            </Text>
          )}
          {assignedTo && (
            <Text>
              <Text dimColor>Assigned: </Text>
              <Text color="magenta">@{assignedTo}</Text>
            </Text>
          )}
        </Box>
      )}

      {/* Project path */}
      {projectPath.length > 0 && (
        <Box paddingX={1}>
          <Text>
            <Text dimColor>Project: </Text>
            <Text>{projectPath.join(" / ")}</Text>
          </Text>
        </Box>
      )}

      {/* References */}
      {hasRefs && (
        <Box paddingX={1} flexDirection="row" flexWrap="wrap" gap={1}>
          {refs.tags.map((tag) => (
            <Text key={`tag-${tag}`} color="blue">
              #{tag}
            </Text>
          ))}
          {refs.mentions.map((m) => (
            <Text key={`mention-${m}`} color="magenta">
              @{m}
            </Text>
          ))}
          {refs.projects.map((p) => (
            <Text key={`project-${p}`} color="green">
              +{p}
            </Text>
          ))}
          {refs.wikilinks.map((w) => (
            <Text key={`wiki-${w}`} color="cyan">
              [[{w}]]
            </Text>
          ))}
        </Box>
      )}

      {/* Content section */}
      {displayContent.length > 0 && (
        <Box
          flexDirection="column"
          paddingX={1}
          marginTop={1}
          width={innerWidth}
        >
          <Text bold dimColor>
            Content
          </Text>
          {displayContent.map((line, i) => (
            <Text key={i} wrap="truncate">
              {line}
            </Text>
          ))}
          {hasMoreContent && <Text dimColor>...</Text>}
        </Box>
      )}

      {/* Subtasks */}
      {subtasks.length > 0 && (
        <Box
          flexDirection="column"
          paddingX={1}
          marginTop={1}
          width={innerWidth}
        >
          <Text bold dimColor>
            Subtasks ({subtasks.length})
          </Text>
          {subtasks.slice(0, maxSubtasks).map((task) => (
            <Text key={task.id} wrap="truncate">
              <Text dimColor={task.task_status === "done"}>
                {getSubtaskCheckbox(task.task_status)}{" "}
              </Text>
              <Text dimColor={task.task_status === "done"}>
                {task.content || getNodeDisplayName(task)}
              </Text>
            </Text>
          ))}
          {subtasks.length > maxSubtasks && (
            <Text dimColor> +{subtasks.length - maxSubtasks} more</Text>
          )}
        </Box>
      )}

      {/* Backlinks */}
      {backlinkNodes.length > 0 && (
        <Box
          flexDirection="column"
          paddingX={1}
          marginTop={1}
          width={innerWidth}
        >
          <Text bold dimColor>
            Backlinks ({backlinkNodes.length})
          </Text>
          {backlinkNodes.slice(0, maxBacklinks).map((bl) => (
            <Text key={bl.id} wrap="truncate" dimColor>
              {"- "}[[{getNodeDisplayName(bl)}]]
            </Text>
          ))}
          {backlinkNodes.length > maxBacklinks && (
            <Text dimColor> +{backlinkNodes.length - maxBacklinks} more</Text>
          )}
        </Box>
      )}

      {/* Keybindings hint */}
      <Box flexGrow={1} />
      <Box paddingX={1}>
        <Text dimColor>h/Esc:close Space:status 1-5:priority</Text>
      </Box>
    </Box>
  );
}

// Export for testing
export { extractReferences, formatDate, getStatusDisplay, getProjectPath };
