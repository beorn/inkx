/**
 * New Item Dialog Component
 *
 * Quick capture dialog for creating new items in the board.
 * Uses context from the cursor item for defaults.
 */
import React from "react"
import { Box, Text, CursorLine, ModalDialog } from "@silvery/ag-react"
import { KNode } from "@km/core"
import { useUndoHandle } from "../services-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { useDialogInput } from "../hooks/use-dialog-input.ts"

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
  return KNode.isOutline(cursorNode) ? cursorNode.id : cursorNode.parent_id
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
  const undoHandle = useUndoHandle()

  // Determine insert location
  const parentId = getInsertParentId(cursorNode)
  const _parentIdx = getInsertIdx(cursorNode, parentId, repo.getChildren.bind(repo))
  const insertContext = getInsertContext(cursorNode, parentId, repo.getNode.bind(repo), (node) =>
    getNodeDisplayName(repo, node),
  )

  // Determine if cursor is a task (new item will also be a task)
  const isTask = cursorNode?.item?.task?.marker != null || cursorNode === null

  // Use refs to avoid stale closure issues with the handler
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  const onCreateRef = React.useRef(onCreate)
  onCreateRef.current = onCreate

  const editCtx = useDialogInput({
    initialValue: "",
    onConfirm: (content) => {
      if (!content.trim()) {
        onCancelRef.current()
        return
      }
      undoHandle.setCursor(cursorNode?.id ?? null)
      const nodeId = repo.addNode(parentId, {
        type: "p",
        item: isTask ? { list: "-", task: { marker: "[ ]", status: "todo" } } : undefined,
        content: content.trim(),
      })
      onCreateRef.current(nodeId)
    },
    onCancel: () => onCancelRef.current(),
  })

  return (
    <ModalDialog
      borderColor={"$success"}
      title={`New ${isTask ? "task" : "item"} ${insertContext}`}
      width={width}
      height={Math.min(height, 12)}
      footer="Enter create  Esc cancel"
    >
      {/* Input field */}
      <Box borderStyle="round" borderColor={"$focusborder"} flexShrink={0}>
        <Text>
          <Text color={"$success"}>{isTask ? "[ ] " : "• "}</Text>
          <CursorLine beforeCursor={editCtx.beforeCursor} afterCursor={editCtx.afterCursor} />
        </Text>
      </Box>
    </ModalDialog>
  )
}
