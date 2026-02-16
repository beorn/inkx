/**
 * New Item Dialog Component
 *
 * Quick capture dialog for creating new items in the board.
 * Uses context from the cursor item for defaults.
 */
import React, { useState } from "react"
import { useApp as useAppStore } from "inkx/runtime"
import { Box, Text } from "inkx"
import { isOutline, type KNode } from "@km/core"
import type { BoardAppStore } from "../board-app-store.ts"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import { useRepo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { ModalDialog } from "./shared-components.tsx"
import { dialogTargetRef } from "../dialog-target.ts"
import { blockEditTargetRef, type BlockEditTarget } from "../block-edit-target.ts"

export interface NewItemDialogProps {
  /** The currently selected node (for context/defaults) */
  cursorNode: KNode | null
  /** Callback when item is created */
  onCreate: (newNodeId: string) => void
  /** Callback when dialog is cancelled */
  onCancel: () => void
  /** Dialog dimensions */
  width: number
  height: number
}

// Outline items (oi) act as containers (insert as child, not sibling)

/**
 * Get the parent to insert into based on cursor node
 * For containers, insert as child. Otherwise insert as sibling.
 */
function getInsertParentId(cursorNode: KNode | null): string | null {
  if (!cursorNode) return null
  return isOutline(cursorNode.type) ? cursorNode.id : cursorNode.parent_id
}

/**
 * Calculate parent_idx to insert above current item
 */
function getInsertIdx(
  cursorNode: KNode | null,
  parentId: string | null,
  getChildren: (id: string | null) => KNode[],
): number {
  if (!cursorNode || !parentId) return 0

  // If inserting as sibling, place just before cursor
  if (cursorNode.parent_id === parentId) {
    return (cursorNode.parent_idx ?? 0) - 0.001
  }

  // If inserting as child, place at start
  const children = getChildren(parentId)
  if (children.length === 0) return 0

  // Insert at start (before first child)
  const firstChild = children[0]
  return (firstChild?.parent_idx ?? 0) - 0.001
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
  if (!parentId) return "root"

  const parent = getNode(parentId)
  if (!parent) return "unknown"

  const parentName = getDisplayName(parent)

  // If inserting as sibling, show "above X in Y"
  if (cursorNode && cursorNode.parent_id === parentId) {
    const cursorName = getDisplayName(cursorNode)
    return `above "${cursorName}" in ${parentName}`
  }

  // If inserting as child, show "in Y"
  return `in ${parentName}`
}

export function NewItemDialog({
  cursorNode,
  onCreate,
  onCancel,
  width,
  height,
}: NewItemDialogProps): React.ReactElement {
  const repo = useRepo()
  const undoHandle = useAppStore<BoardAppStore, UndoableRepoHandle>((s) => s.undoHandle)
  const [content, setContent] = useState("")

  // Determine insert location
  const parentId = getInsertParentId(cursorNode)
  const _parentIdx = getInsertIdx(cursorNode, parentId, repo.getChildren.bind(repo))
  const insertContext = getInsertContext(cursorNode, parentId, repo.getNode.bind(repo), (node) =>
    getNodeDisplayName(repo, node),
  )

  // Determine if cursor is a task (new item will also be a task)
  const isTask = cursorNode?.task_marker != null || cursorNode === null

  // Use refs to avoid stale closure issues with the handler
  const contentRef = React.useRef(content)
  contentRef.current = content
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  const onCreateRef = React.useRef(onCreate)
  onCreateRef.current = onCreate

  // Register dialog target for command system navigation (Enter/Escape)
  // and block edit target for text input (char insert, backspace, etc.)
  React.useLayoutEffect(() => {
    const doCreate = () => {
      if (!contentRef.current.trim()) {
        onCancelRef.current()
        return
      }
      undoHandle.setCursor(cursorNode?.id ?? null)
      const nodeId = repo.addNode(parentId, {
        type: isTask ? "li" : "p",
        content: contentRef.current.trim(),
        task_status: isTask ? "todo" : undefined,
        task_marker: isTask ? "[ ]" : undefined,
        list_marker: isTask ? "-" : undefined,
      })
      onCreateRef.current(nodeId)
    }

    dialogTargetRef.current = {
      navUp() {},
      navDown() {},
      confirm: doCreate,
      cancel() {
        onCancelRef.current()
      },
    }

    // Simple text edit target for character input
    const textTarget: BlockEditTarget = {
      insertChar(char: string) {
        setContent((c) => c + char)
      },
      deleteBackward() {
        setContent((c) => c.slice(0, -1))
      },
      deleteForward() {},
      cursorLeft() {},
      cursorRight() {},
      cursorStart() {},
      cursorEnd() {},
      deleteWord() {
        setContent((c) => {
          const trimmed = c.trimEnd()
          const lastSpace = trimmed.lastIndexOf(" ")
          return lastSpace === -1 ? "" : trimmed.slice(0, lastSpace)
        })
      },
      deleteToStart() {
        setContent("")
      },
      deleteToEnd() {},
      confirm: doCreate,
      cancel() {
        onCancelRef.current()
      },
      save() {},
      getCursorOffset() {
        return contentRef.current.length
      },
      getContent() {
        return contentRef.current
      },
    }
    blockEditTargetRef.current = textTarget

    return () => {
      dialogTargetRef.current = null
      if (blockEditTargetRef.current === textTarget) {
        blockEditTargetRef.current = null
      }
    }
  }, [repo, parentId, isTask])

  return (
    <ModalDialog
      borderColor="green"
      title={`New ${isTask ? "task" : "item"} ${insertContext}`}
      width={width}
      height={Math.min(height, 12)}
      footer="Enter create  Esc cancel"
    >
      {/* Input field */}
      <Box flexGrow={1}>
        <Text>
          <Text color="green">{isTask ? "[ ] " : "• "}</Text>
          <Text>{content}</Text>
          <Text inverse> </Text>
        </Text>
      </Box>
    </ModalDialog>
  )
}
