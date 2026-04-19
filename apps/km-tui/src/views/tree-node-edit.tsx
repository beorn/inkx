/**
 * Editing components for TreeNode — only mounted on the ONE node being edited.
 *
 * Extracted from TreeNode.tsx to reduce per-node hook overhead. Before the split,
 * ALL TreeNodes mounted ~30 hooks even when not editing. After, only the edited
 * node mounts the edit hooks via TitleEditor/BodyBlockEditor.
 */

import React, { useCallback, useMemo } from "react"
import { Box, Text } from "@silvery/ag-react"
import { KNode, stringifyTaskMetadata, parseTaskMetadataFromText } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import { extractBody, split, mergeBackward } from "@km/tree"
import type { NodeEditState } from "../state/reactive.ts"
import type { BoardAppStore } from "../state/board-app-store.ts"
import { dispatchSelection, NO_SELECTION, nodeSelect, textCaret } from "../state/selection.ts"
import type { JobRunner } from "@km/core"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import { InlineEditField } from "./InlineEditField.tsx"
import { BodyEditField } from "./BodyEditField.tsx"
import { isHRContent, stripTaskMark, MAX_EXPANDED_CHILDREN } from "./tree-node-helpers.tsx"
import { useRepoEffect } from "../hooks/use-repo-effect.ts"

// =============================================================================
// composeRawEditContent — append field-only metadata for editing visibility
// =============================================================================

/**
 * When editing, show raw markdown content with metadata from node fields
 * that aren't already in the text (due dates, priority, recurrence, assigned_to).
 * Uses shared stringifyTaskMetadata from @km/core for DRY consistency
 * with the markdown serializer.
 * On save, the parser re-extracts these back to fields — round-trip safe.
 */
export function composeRawEditContent(node: KNode): string {
  // Use content if available, falling back to data.name for folder-type nodes
  // (oi nodes store their title in data.name, not content).
  let baseContent = node.content ?? (node.data?.name as string) ?? ""
  // For empty files, pre-populate with the basename so the user edits what they see
  // (display layer shows basename via getNodeDisplayName fallback).
  if (!baseContent && node.fs_path) {
    const filename = node.fs_path.split("/").pop() || ""
    baseContent = filename.replace(/\.md$/, "")
  }
  return stringifyTaskMetadata(baseContent, node, { includeAssignedTo: true })
}

// =============================================================================
// TitleEditor — editing callbacks + InlineEditField for the node title
// =============================================================================

interface TitleEditorProps {
  displayNode: KNode
  editState: NodeEditState
  nodeIsTask: boolean
  repo: Repo
  setUI: BoardAppStore["setUI"]
  sel: import("@silvery/selection").SelectionStore
  jobRunner: JobRunner
  undoHandle: UndoableRepoHandle
}

/**
 * Wraps InlineEditField with all title editing callbacks.
 * Only mounted when editBlockIndex === 0 (title is being edited).
 */
export function TitleEditor({
  displayNode,
  editState,
  nodeIsTask,
  repo,
  setUI,
  sel,
  jobRunner,
  undoHandle,
}: TitleEditorProps): React.ReactElement {
  const repoUpdate = useRepoEffect(repo)

  // Compose raw edit content with field-only metadata appended
  const rawEditContent = displayNode.type === "hr" && !displayNode.content ? "---" : composeRawEditContent(displayNode)
  const editContent = nodeIsTask ? stripTaskMark(rawEditContent) : rawEditContent

  // Title save callback (persists without exiting edit mode)
  // Strips inline metadata (due:, start:, p:, recur:) from edited text and
  // restores them as structured fields on the node.
  // For outline/heading nodes (folders, sections), also updates `name` so that
  // filesystem sync and display name stay in sync with the edited content.
  const handleTitleSave = useCallback(
    (newValue: string) => {
      // Use the same fallback chain as composeRawEditContent so that
      // Esc-without-changes is a no-op (basename pre-fill matches originalContent).
      let originalContent = displayNode.content ?? (displayNode.data?.name as string) ?? ""
      if (!originalContent && displayNode.fs_path) {
        const filename = displayNode.fs_path.split("/").pop() || ""
        originalContent = filename.replace(/\.md$/, "")
      }
      const { cleanContent, ...metaFields } = parseTaskMetadataFromText(newValue)
      // Content is always clean text — task markers belong in item.task, not content.
      // The serializer (nodes2md.ts) reconstructs "- [x] content" from item.task.marker + content.
      // Re-inserting the marker here would cause double markers on re-parse.
      const newContent = cleanContent
      // No-op: value didn't change and no metadata to update
      if (newContent === originalContent && Object.keys(metaFields).length === 0) return
      undoHandle.setCursor(displayNode.id)
      // Normalization pipeline auto-derives title from content and name for outline nodes.
      // Metadata fields (due_at, start_at, etc.) are merged in as-is.
      repoUpdate(displayNode.id, { content: newContent, ...metaFields })
    },
    [displayNode.id, displayNode.content, displayNode.type, displayNode.item, repo, undoHandle],
  )

  // Inline edit callbacks — uses renameNode for backlink-safe renames.
  // Strips inline metadata (due:, start:, p:, recur:) from edited text and
  // restores them as structured fields on the node.
  const handleInlineEditConfirm = useCallback(
    (newValue: string) => {
      // If the node was deleted (e.g. edit-after-delete), bail out — no repo
      // ops to run and another node's edit may already be in progress.
      if (!repo.getNode(displayNode.id)) return

      // Content is always clean text — task markers belong in item.task, not content.
      const originalContent = displayNode.content ?? (displayNode.data?.name as string) ?? ""
      const { cleanContent, ...metaFields } = parseTaskMetadataFromText(newValue)
      const newContent = cleanContent
      const hasMetaUpdates = Object.keys(metaFields).length > 0

      // No-op: value didn't change and no metadata to update
      if (newContent === originalContent && !hasMetaUpdates) {
        // Only deselect if we're still editing THIS node — another node's
        // edit may already be in progress (e.g. edit-after-delete).
        if (sel.text()?.nodeId === displayNode.id) dispatchSelection({ sel }, NO_SELECTION)
        return
      }

      // Update metadata fields if any were parsed from the edited text
      if (hasMetaUpdates) {
        repo.updateNode(displayNode.id, metaFields)
      }

      // Only do a full rename if name was already in sync with content (or unset).
      const node = repo.getNode(displayNode.id)
      const oldName = node?.name ?? ""
      const nameMatchedContent = !oldName || oldName === originalContent

      if (newContent !== originalContent && nameMatchedContent) {
        const impact = repo.getRenameImpact(displayNode.id)
        const s = impact.backlinks.length === 1 ? "" : "s"

        jobRunner.submit({
          description: `Renaming '${oldName}' → '${cleanContent}'`,
          impact: impact.backlinks.length > 0 ? `${impact.backlinks.length} backlink${s} will be updated` : "",
          countdownMs: impact.backlinks.length > 0 ? 5000 : 0,
          execute: (onProgress) => {
            undoHandle.setCursor(displayNode.id)
            undoHandle.startBatch("Rename")
            repo.renameNode(displayNode.id, newContent, (info) => onProgress(info.updated, info.total))
            undoHandle.endBatch()
            // Re-anchor the cursor to the renamed node. The view lens recomputes
            // after renameNode (parent children cache busts, walkOrder shifts),
            // so any prior selection that referenced the now-stale walkOrder
            // snapshot would normalize to empty → cursor null → invariant
            // violation. Re-selecting after the mutation forces normalization
            // against the fresh walkOrder.
            // See bead km-tui.rename-column-cursor-null.
            dispatchSelection({ sel }, nodeSelect(displayNode.id))
          },
        })
      } else if (newContent !== originalContent) {
        // Name and content diverged — just update content, don't rename
        undoHandle.setCursor(displayNode.id)
        repoUpdate(displayNode.id, { content: newContent })
        // Same defensive re-anchor as the rename branch above.
        dispatchSelection({ sel }, nodeSelect(displayNode.id))
      }

      // HR type conversion: p/li with HR content → hr, hr with non-HR content → p
      const hrMatch = isHRContent(newContent)
      const currentType = displayNode.type
      if (hrMatch && currentType === "p" && !KNode.isOutline(displayNode)) {
        repo.updateNode(displayNode.id, { type: "hr" })
      } else if (!hrMatch && currentType === "hr") {
        repo.updateNode(displayNode.id, { type: "p" })
      }

      // Only deselect if we're still editing THIS node — another node's
      // edit may already be in progress (e.g. edit-after-delete).
      if (sel.text()?.nodeId === displayNode.id) dispatchSelection({ sel }, NO_SELECTION)
    },
    [displayNode.id, displayNode.content, repo, setUI, jobRunner, undoHandle],
  )

  const handleInlineEditCancel = useCallback(() => {
    // Only deselect if we're still editing THIS node — another node's
    // edit may already be in progress (e.g. edit-after-delete).
    if (sel.text()?.nodeId === displayNode.id) dispatchSelection({ sel }, NO_SELECTION)
  }, [setUI])

  // Split at boundary: Enter in title creates a new sibling node
  const handleSplitAtBoundary = useCallback(
    (offset: number) => {
      try {
        undoHandle.setCursor(displayNode.id)
        undoHandle.startBatch("Split node")
        const result = split(repo, displayNode.id, offset)
        undoHandle.endBatch()
        // Focus the new node (text after cursor) in edit mode
        dispatchSelection({ sel }, textCaret(result.afterId, 0))
      } catch {
        undoHandle.endBatch()
        // Split failed (e.g., root node) — visual bell
        setUI({ bellState: "split-failed" })
      }
    },
    [displayNode.id, repo, setUI, undoHandle],
  )

  // Merge backward: Backspace at start of title merges with previous sibling
  const handleMergeBackward = useCallback(() => {
    try {
      undoHandle.setCursor(displayNode.id)
      undoHandle.startBatch("Merge nodes")
      const result = mergeBackward(repo, displayNode.id)
      undoHandle.endBatch()
      if (result) {
        // Focus the survivor with cursor at the merge point
        dispatchSelection(
          { sel },
          textCaret(result.survivorId, typeof result.cursorOffset === "number" ? result.cursorOffset : 0),
        )
      }
    } catch {
      undoHandle.endBatch()
      // Merge failed — visual bell
      setUI({ bellState: "merge-failed" })
    }
  }, [displayNode.id, repo, setUI, undoHandle])

  return (
    <InlineEditField
      initialValue={editContent}
      onConfirm={handleInlineEditConfirm}
      onCancel={handleInlineEditCancel}
      onSave={handleTitleSave}
      onSplitAtBoundary={handleSplitAtBoundary}
      onMergeBackward={handleMergeBackward}
      initialCursorPos={editState?.initialCursorPos}
      stickyX={editState?.stickyX}
    />
  )
}

// =============================================================================
// BodyBlockEditor — editing for body children (paragraphs, code blocks, etc.)
// =============================================================================

/**
 * Component interface for the TreeNode renderer used by non-active body blocks.
 * Passed in as a prop to break the circular import (TreeNode.tsx imports
 * this file, so this file cannot statically import TreeNode).
 */
type TreeNodeRenderer = React.ComponentType<{
  node: KNode
  depth: number
  isSelected: boolean
  colIndex: number
  cardIndex: number
  getChildren?: (id: string) => KNode[]
  isBody?: boolean
}>

interface BodyBlockEditorProps {
  displayNode: KNode
  editState: NodeEditState
  childrenSourceId: string
  resolvedGetChildren: (id: string) => KNode[]
  depth: number
  colIndex: number
  cardIndex: number
  repo: Repo
  setUI: BoardAppStore["setUI"]
  sel: import("@silvery/selection").SelectionStore
  undoHandle: UndoableRepoHandle
  /** TreeNode component injected from the call site to break the circular import. */
  TreeNode: TreeNodeRenderer
}

/**
 * Renders body children as editable blocks when the node is being edited.
 * Only mounted when isInlineEditing is true.
 *
 * Non-active body blocks render via TreeNode (display mode, isBody=true) so
 * they preserve bullets, checkboxes, indentation, and width constraints.
 * The active block uses BodyEditField for inline editing.
 */
export function BodyBlockEditor({
  displayNode,
  editState,
  childrenSourceId,
  resolvedGetChildren,
  depth,
  colIndex,
  cardIndex,
  repo,
  setUI,
  sel,
  undoHandle,
  TreeNode,
}: BodyBlockEditorProps): React.ReactElement | null {
  const repoUpdate = useRepoEffect(repo)
  const editBlockIndex = editState.blockIndex

  // Compute body/structural split for per-block navigation
  const bodyChildren = useMemo(() => {
    const allChildren = resolvedGetChildren(childrenSourceId)
    return extractBody(allChildren).body
  }, [childrenSourceId, resolvedGetChildren])

  // Body block save callback (persists content for a body child)
  const handleBlockSave = useCallback(
    (childId: string, newValue: string) => {
      undoHandle.setCursor(displayNode.id)
      repoUpdate(childId, { content: newValue })
    },
    [repoUpdate, undoHandle, displayNode.id],
  )

  const handleInlineEditCancel = useCallback(() => {
    // Only deselect if we're still editing THIS node — another node's
    // edit may already be in progress (e.g. edit-after-delete).
    if (sel.text()?.nodeId === displayNode.id) dispatchSelection({ sel }, NO_SELECTION)
  }, [setUI])

  // Cap visible body children to prevent cards with hundreds of items from
  // overflowing the card border. Show a window around the active edit block.
  // Must be before the early return to satisfy React hooks rules.
  const visibleBody = useMemo(() => {
    if (bodyChildren.length === 0) return { children: bodyChildren, startIndex: 0 }
    if (bodyChildren.length <= MAX_EXPANDED_CHILDREN) return { children: bodyChildren, startIndex: 0 }
    // Center the window around the active block (editBlockIndex is 1-based, 0 = title)
    const activeIdx = Math.max(0, editBlockIndex - 1) // convert to 0-based child index
    const half = Math.floor(MAX_EXPANDED_CHILDREN / 2)
    let start = Math.max(0, activeIdx - half)
    const end = Math.min(bodyChildren.length, start + MAX_EXPANDED_CHILDREN)
    start = Math.max(0, end - MAX_EXPANDED_CHILDREN) // adjust if near the end
    return { children: bodyChildren.slice(start, end), startIndex: start }
  }, [bodyChildren, editBlockIndex])

  if (bodyChildren.length === 0) return null

  return (
    <>
      {visibleBody.children.map((child, i) => {
        const realIndex = visibleBody.startIndex + i
        const blockIndex = realIndex + 1 // 0 is title
        const isActiveBlock = editBlockIndex === blockIndex
        return (
          <Box key={`${child.id}-${i}`} paddingLeft={depth}>
            <Text dimColor={!isActiveBlock} color={"$focusborder"}>
              {" "}
            </Text>
            {isActiveBlock ? (
              <BodyEditField
                initialValue={child.content ?? ""}
                onConfirm={(v) => {
                  handleBlockSave(child.id, v)
                  // Only deselect if we're still editing THIS node
                  if (sel.text()?.nodeId === displayNode.id) dispatchSelection({ sel }, NO_SELECTION)
                }}
                onCancel={handleInlineEditCancel}
                onSave={(v) => handleBlockSave(child.id, v)}
                initialCursorPos={editState?.initialCursorPos}
                stickyX={editState?.stickyX}
                onSplitAtBoundary={(offset) => {
                  try {
                    undoHandle.setCursor(displayNode.id)
                    undoHandle.startBatch("Split block")
                    const result = split(repo, child.id, offset)
                    undoHandle.endBatch()
                    dispatchSelection({ sel }, textCaret(result.afterId, 0))
                  } catch {
                    undoHandle.endBatch()
                    setUI({ bellState: "split-failed" })
                  }
                }}
                onMergeBackward={() => {
                  try {
                    undoHandle.setCursor(displayNode.id)
                    undoHandle.startBatch("Merge blocks")
                    const result = mergeBackward(repo, child.id)
                    undoHandle.endBatch()
                    if (result) {
                      dispatchSelection(
                        { sel },
                        textCaret(
                          result.survivorId,
                          typeof result.cursorOffset === "number" ? result.cursorOffset : 0,
                        ),
                      )
                    }
                  } catch {
                    undoHandle.endBatch()
                    setUI({ bellState: "merge-failed" })
                  }
                }}
              />
            ) : (
              // Render non-active body blocks via TreeNode (display mode, isBody=true)
              // so they keep their bullets, checkboxes, indentation, and width
              // constraints. Without this, they flatten into raw text and overflow
              // past the card border (km-tui.body-edit-structure).
              <TreeNode
                node={child}
                depth={depth + 1}
                isSelected={false}
                colIndex={colIndex}
                cardIndex={cardIndex}
                getChildren={resolvedGetChildren}
                isBody
              />
            )}
          </Box>
        )
      })}
    </>
  )
}
