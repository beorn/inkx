/**
 * New Item Dialog Component
 *
 * Quick capture dialog for creating new items in the board.
 * Uses context from the cursor item for defaults.
 */
import React, { useState } from "react";
import { Box, Text, useInput } from "inkx";
import { ulid } from "ulid";
import type { KNode } from "@km/core";
import { getNode, getChildren, emitNodeCreated } from "@km/storage";
import { getNodeDisplayName } from "../state.ts";

export interface NewItemDialogProps {
  /** The currently selected node (for context/defaults) */
  cursorNode: KNode | null;
  /** Callback when item is created */
  onCreate: (newNodeId: string) => void;
  /** Callback when dialog is cancelled */
  onCancel: () => void;
  /** Dialog dimensions */
  width: number;
  height: number;
}

// Types that act as containers (insert as child, not sibling)
const CONTAINER_TYPES = new Set(["section", "file", "folder"]);

/**
 * Get the parent to insert into based on cursor node
 * For containers, insert as child. Otherwise insert as sibling.
 */
function getInsertParentId(cursorNode: KNode | null): string | null {
  if (!cursorNode) return null;
  return CONTAINER_TYPES.has(cursorNode.type)
    ? cursorNode.id
    : cursorNode.parent_id;
}

/**
 * Calculate parent_idx to insert above current item
 */
function getInsertIdx(
  cursorNode: KNode | null,
  parentId: string | null,
): number {
  if (!cursorNode || !parentId) return 0;

  // If inserting as sibling, place just before cursor
  if (cursorNode.parent_id === parentId) {
    return (cursorNode.parent_idx ?? 0) - 0.001;
  }

  // If inserting as child, place at start
  const children = getChildren(parentId);
  if (children.length === 0) return 0;

  // Insert at start (before first child)
  const firstChild = children[0];
  return (firstChild?.parent_idx ?? 0) - 0.001;
}

/**
 * Get display context for the insertion point
 */
function getInsertContext(
  cursorNode: KNode | null,
  parentId: string | null,
): string {
  if (!parentId) return "root";

  const parent = getNode(parentId);
  if (!parent) return "unknown";

  const parentName = getNodeDisplayName(parent);

  // If inserting as sibling, show "above X in Y"
  if (cursorNode && cursorNode.parent_id === parentId) {
    const cursorName = getNodeDisplayName(cursorNode);
    return `above "${cursorName}" in ${parentName}`;
  }

  // If inserting as child, show "in Y"
  return `in ${parentName}`;
}

export function NewItemDialog({
  cursorNode,
  onCreate,
  onCancel,
  width,
  height,
}: NewItemDialogProps): React.ReactElement {
  const [content, setContent] = useState("");

  // Determine insert location
  const parentId = getInsertParentId(cursorNode);
  const parentIdx = getInsertIdx(cursorNode, parentId);
  const insertContext = getInsertContext(cursorNode, parentId);

  // Determine if cursor is a task (new item will also be a task)
  const isTask = cursorNode?.type === "task" || cursorNode === null;

  useInput((input, key) => {
    // Cancel on Escape
    if (key.escape) {
      onCancel();
      return;
    }

    // Create on Enter
    if (key.return) {
      if (!content.trim()) {
        onCancel();
        return;
      }

      // Create the new node
      const nodeId = ulid();
      emitNodeCreated(process.env.USER ?? "user", {
        id: nodeId,
        type: isTask ? "task" : "paragraph",
        parent_id: parentId,
        parent_idx: parentIdx,
        content: content.trim(),
        task_status: isTask ? "todo" : undefined,
        task_mark: isTask ? " " : undefined,
      });

      onCreate(nodeId);
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      setContent((c) => c.slice(0, -1));
      return;
    }

    // Regular character input
    if (input.length === 1 && input >= " ") {
      setContent((c) => c + input);
    }
  });

  const innerWidth = Math.max(10, width - 4);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={Math.min(height, 10)}
      borderStyle="double"
      borderColor="green"
    >
      {/* Header */}
      <Box paddingX={1}>
        <Text bold>
          New {isTask ? "task" : "item"} {insertContext}
        </Text>
      </Box>

      {/* Separator */}
      <Box paddingX={1}>
        <Text dimColor>{"─".repeat(innerWidth)}</Text>
      </Box>

      {/* Input field */}
      <Box paddingX={1} flexGrow={1}>
        <Text>
          <Text color="green">{isTask ? "[ ] " : "• "}</Text>
          <Text>{content}</Text>
          <Text inverse> </Text>
        </Text>
      </Box>

      {/* Hints */}
      <Box paddingX={1}>
        <Text dimColor>Enter:create Esc:cancel</Text>
      </Box>
    </Box>
  );
}
