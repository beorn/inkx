import React from "react"
import { Text } from "@silvery/ag-react"
import { KNode } from "@km/core"
import { getStatusIcon, type StatusIcon } from "../text/index.ts"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import { CheckboxIcon } from "./CheckboxIcon.tsx"

export function getNodeTitleIcon(
  node: KNode,
  fallbackIcon: StatusIcon,
  ownColor?: string,
): { icon: StatusIcon; isTask: boolean; isDoneOrDropped: boolean } {
  const isTask = KNode.isTask(node)
  const isDoneOrDropped = node.item?.task?.status === "done" || node.item?.task?.status === "dropped"
  if (isTask) {
    return {
      icon: getStatusIcon(node.item?.task?.status ?? "todo"),
      isTask,
      isDoneOrDropped,
    }
  }
  return {
    icon: ownColor ? { ...fallbackIcon, color: ownColor } : fallbackIcon,
    isTask,
    isDoneOrDropped,
  }
}

export interface NodeTitleMarkerProps {
  node: KNode
  icon: StatusIcon
  textColor?: string
  shouldDim?: boolean
  isSelected?: boolean
  isNodeSelected?: boolean
  interactive?: boolean
  undoHandle?: UndoableRepoHandle
}

export function NodeTitleMarker({
  node,
  icon,
  textColor,
  shouldDim = false,
  isSelected = false,
  isNodeSelected = false,
  interactive = true,
  undoHandle,
}: NodeTitleMarkerProps): React.ReactElement {
  const isTask = KNode.isTask(node)
  const isDoneOrDropped = node.item?.task?.status === "done" || node.item?.task?.status === "dropped"
  if (isTask && interactive) {
    return (
      <CheckboxIcon
        nodeId={node.id}
        icon={icon}
        textColor={textColor}
        shouldDim={shouldDim}
        isSelected={isSelected}
        isNodeSelected={isNodeSelected}
        isDoneOrDropped={isDoneOrDropped}
        undoHandle={undoHandle}
      />
    )
  }

  const isHighlighted = isSelected || isNodeSelected
  const color = isHighlighted ? textColor : isDoneOrDropped ? undefined : icon.color
  return <Text color={shouldDim ? "$muted" : color}>{icon.char}</Text>
}
