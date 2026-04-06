/**
 * CheckboxIcon — Interactive task status toggle
 *
 * Arms on hover (bold + primary color, pointer cursor), toggles done/todo on click.
 * Follows the arm-on-hover pattern from silvery's Link component.
 *
 * Click toggles between done and the previous non-done status (defaults to todo).
 * Calls preventDefault()/stopPropagation() on both mousedown and click to prevent
 * the board handler from selecting the card or moving the cursor.
 *
 * After toggling, re-selects the current cursor node to counteract reactive
 * re-evaluation that would otherwise move the cursor to the changed node.
 * This mirrors handleTaskStatusCycle (board-actions-edit.ts) which explicitly
 * re-selects after toggling status via the keyboard shortcut.
 *
 * Works in board tree, detail view, and popover contexts. The undoHandle prop is
 * optional — when omitted (e.g., in popovers rendered outside TreeRenderProvider),
 * the status toggle still works but without undo tracking.
 */

import React, { useCallback, useState } from "react"
import { Text, useMouseCursor } from "@silvery/ag-react"
import { StoreContext } from "@silvery/create/create-app"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { getMarkerForStatus, type TaskStatus } from "@km/core"
import type { StatusIcon } from "../text/index.ts"
import { useRepo } from "../repo-context.tsx"
import { Workspace, type BoardAppStore } from "../state/board-app-store.ts"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"

interface CheckboxIconProps {
  /** Node ID for the task to toggle */
  nodeId: string
  /** The status icon to display (char + color) */
  icon: StatusIcon
  /** Text color override (e.g., when selected) */
  textColor: string | undefined
  /** Whether to dim the icon */
  shouldDim: boolean
  /** Whether this node is selected (affects color override) */
  isSelected: boolean
  /** Whether this node is multi-selected */
  isNodeSelected: boolean
  /** Whether the task is done/dropped (affects color override) */
  isDoneOrDropped: boolean
  /** Optional undo handle — when provided, records cursor for undo tracking */
  undoHandle?: UndoableRepoHandle
}

/**
 * Interactive checkbox icon that arms on hover and toggles task status on click.
 *
 * Hover: bold + primary color + pointer cursor (icon character stays visible).
 * Click: toggle between done and todo (or previous non-done status).
 */
export const CheckboxIcon = React.memo(function CheckboxIcon({
  nodeId,
  icon,
  textColor,
  shouldDim,
  isSelected,
  isNodeSelected,
  isDoneOrDropped,
  undoHandle,
}: CheckboxIconProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const armed = hovered
  useMouseCursor(armed ? "pointer" : null)

  const repo = useRepo()
  const storeRef = React.useContext(StoreContext) as
    | import("../state/signal-store.ts").SignalStoreApi<BoardAppStore>
    | null

  const handleMouseEnter = useCallback(() => {
    setHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHovered(false)
  }, [])

  // Prevent the board-level mousedown handler from moving the cursor
  // to this sub-item when the user clicks the checkbox icon.
  const handleMouseDown = useCallback((e: SilveryMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      // Prevent the board handler from selecting the card on this click
      e.preventDefault()
      e.stopPropagation()

      // Resolve target node (follow symlink_to if applicable)
      const node = repo.getNode(nodeId)
      if (!node) return
      const targetId = node.symlink_to || nodeId
      const targetNode = node.symlink_to ? repo.getNode(node.symlink_to) : node
      if (!targetNode) return

      const currentStatus = targetNode.item?.task?.status ?? "todo"
      const newStatus: TaskStatus = currentStatus === "done" ? "todo" : "done"

      // Record the current cursor position for undo (not the checkbox's node),
      // so undo restores the cursor to where it was before the click.
      const state = storeRef?.getState()
      const boardPane = state ? Workspace.getActiveBoardPane(state) : null
      const cursor = (boardPane?.sel.node.cursor() as string | null) ?? null
      if (cursor) undoHandle?.setCursor(cursor)

      // Mutate via repo — same call as the keyboard path (runRepoEffect).
      repo.updateNode(targetId, {
        item: { ...targetNode.item, task: { status: newStatus, marker: getMarkerForStatus(newStatus) } },
      })

      // Re-select the current cursor node to preserve cursor position.
      // Without this, the reactive subscription to node changes can
      // re-evaluate board state and move the cursor to the changed node.
      // This mirrors handleTaskStatusCycle (board-actions-edit.ts) which
      // explicitly re-selects after toggling status.
      if (cursor && state) {
        state.sel.node.select([cursor as import("@silvery/selection").ID])
      }
    },
    [nodeId, repo, undoHandle, storeRef],
  )

  // Determine the icon color
  const isHighlighted = isSelected || isNodeSelected
  const normalColor = isHighlighted ? textColor : isDoneOrDropped ? undefined : icon.color
  // Armed state: bold + primary color so icon character remains visible after toggle
  const armedColor = isHighlighted ? textColor : "$primary"

  return (
    <Text
      color={armed ? armedColor : normalColor}
      dimColor={armed ? false : shouldDim}
      bold={armed}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {icon.char}
    </Text>
  )
})
