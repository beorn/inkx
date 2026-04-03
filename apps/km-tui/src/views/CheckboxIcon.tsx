/**
 * CheckboxIcon — Interactive task status toggle
 *
 * Arms on hover (bold + primary color, pointer cursor), toggles done/todo on click.
 * Follows the arm-on-hover pattern from silvery's Link component.
 *
 * Click toggles between done and the previous non-done status (defaults to todo).
 * Calls preventDefault()/stopPropagation() to prevent the board handler from also
 * selecting the card or moving the cursor.
 *
 * Works in board tree, detail view, and popover contexts. The undoHandle prop is
 * optional — when omitted (e.g., in popovers rendered outside TreeRenderProvider),
 * the status toggle still works but without undo tracking.
 */

import React, { useCallback, useState } from "react"
import { Text, useMouseCursor } from "@silvery/ag-react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { getMarkerForStatus, type TaskStatus } from "@km/core"
import type { StatusIcon } from "../text/index.ts"
import { useRepo } from "../repo-context.tsx"
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
  isMultiSelected: boolean
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
  isMultiSelected,
  isDoneOrDropped,
  undoHandle,
}: CheckboxIconProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const armed = hovered
  useMouseCursor(armed ? "pointer" : null)

  const repo = useRepo()

  const handleMouseEnter = useCallback(() => {
    setHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHovered(false)
  }, [])

  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      // Prevent the board handler from selecting the card on this click
      e.preventDefault()
      e.stopPropagation()

      // Resolve target node (follow embed source if applicable)
      const node = repo.getNode(nodeId)
      if (!node) return
      const targetId = node.embed_source || nodeId
      const targetNode = node.embed_source ? repo.getNode(node.embed_source) : node
      if (!targetNode) return

      const currentStatus = targetNode.item?.task?.status ?? "todo"
      const newStatus: TaskStatus = currentStatus === "done" ? "todo" : "done"

      // Toggle via direct repo mutation. The board's card click handler
      // is blocked by stopPropagation/preventDefault above.
      undoHandle?.setCursor(nodeId)
      repo.updateNode(targetId, {
        item: { ...targetNode.item, task: { status: newStatus, marker: getMarkerForStatus(newStatus) } },
      })
    },
    [nodeId, repo, undoHandle],
  )

  // Determine the icon color
  const isHighlighted = isSelected || isMultiSelected
  const normalColor = isHighlighted ? textColor : isDoneOrDropped ? undefined : icon.color
  // Armed state: bold + primary color so icon character remains visible after toggle
  const armedColor = isHighlighted ? textColor : "$primary"

  return (
    <Text
      color={armed ? armedColor : normalColor}
      dimColor={armed ? false : shouldDim}
      bold={armed}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {icon.char}
    </Text>
  )
})
