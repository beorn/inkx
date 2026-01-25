/**
 * New Item Dialog Component
 *
 * Quick capture dialog for creating new items in the board.
 * Uses context from the cursor item for defaults.
 */
import React, { useState } from "react";
import { Box, Text, useInput } from "inkx";
import type { KNode } from "@km/core";
import { useVault } from "../vault-context.tsx";
import { getNodeDisplayName } from "../state.ts";
import { ModalDialog } from "./shared-components.tsx";

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
  getChildren: (id: string | null) => KNode[],
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
  getNode: (id: string) => KNode | null,
  getDisplayName: (node: KNode) => string,
): string {
  if (!parentId) return "root";

  const parent = getNode(parentId);
  if (!parent) return "unknown";

  const parentName = getDisplayName(parent);

  // If inserting as sibling, show "above X in Y"
  if (cursorNode && cursorNode.parent_id === parentId) {
    const cursorName = getDisplayName(cursorNode);
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
  const vault = useVault();
  const [content, setContent] = useState("");

  // Determine insert location
  const parentId = getInsertParentId(cursorNode);
  const _parentIdx = getInsertIdx(
    cursorNode,
    parentId,
    vault.getChildren.bind(vault),
  );
  const insertContext = getInsertContext(
    cursorNode,
    parentId,
    vault.getNode.bind(vault),
    (node) => getNodeDisplayName(vault, node),
  );

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

      // Create the new node using vault.addNode
      const nodeId = vault.addNode(parentId, {
        type: isTask ? "task" : "paragraph",
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

  const innerWidth = Math.max(10, width - 8); // Account for border + paddingX(2)

  return (
    <ModalDialog
      borderColor="green"
      width={width}
      height={Math.min(height, 10)}
    >
      {/* Header */}
      <Text bold>
        New {isTask ? "task" : "item"} {insertContext}
      </Text>

      {/* Separator */}
      <Text dimColor>{"─".repeat(innerWidth)}</Text>

      {/* Input field */}
      <Box flexGrow={1}>
        <Text>
          <Text color="green">{isTask ? "[ ] " : "• "}</Text>
          <Text>{content}</Text>
          <Text inverse> </Text>
        </Text>
      </Box>

      {/* Hints */}
      <Text dimColor>Enter:create Esc:cancel</Text>
    </ModalDialog>
  );
}
