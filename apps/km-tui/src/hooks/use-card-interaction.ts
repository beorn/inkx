/**
 * Card hover and click interaction hook.
 *
 * - Plain hover → faint border highlight
 * - Click → select the card
 * - Cmd+click → zoom into the card (make it the board root)
 * - Cmd+hover → armed state visual (Kitty protocol)
 */

import React, { useCallback, useState } from "react"
import { StoreContext } from "@silvery/term/runtime"
import { useModifierKeys, useMouseCursor } from "@silvery/react"
import type { SilveryMouseEvent } from "@silvery/term/mouse-events"
import type { BoardAppStore } from "../board-app-store.ts"
import { getActiveBoardPane } from "../board-app-store.ts"
import { saveNavHistoryFromPane } from "../keyboard/keyboard-helpers.ts"

export interface CardInteraction {
  hovered: boolean
  armed: boolean
  hoverBorderColor: string | undefined
  handlers: {
    onMouseEnter: (e: SilveryMouseEvent) => void
    onMouseLeave: (e: SilveryMouseEvent) => void
    onClick: (e: SilveryMouseEvent) => void
  }
}

export function useCardInteraction(nodeId: string, isSelected: boolean): CardInteraction {
  const [hovered, setHovered] = useState(false)
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  const armed = hovered && cmdHeld
  useMouseCursor(armed ? "pointer" : null)

  const storeRef = React.useContext(StoreContext) as import("zustand").StoreApi<BoardAppStore> | null

  const handleMouseEnter = useCallback(() => setHovered(true), [])
  const handleMouseLeave = useCallback(() => setHovered(false), [])

  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      if (!storeRef) return
      const state = storeRef.getState()

      // Find the deepest node with an id under the click target.
      // Sub-items inside cards have id={node.id} — clicking them selects
      // the sub-item, not the card.
      let targetId = nodeId
      let node: any = e.target
      while (node) {
        const id = node.props?.id
        if (typeof id === "string" && id.length > 0) {
          targetId = id
          break
        }
        node = node.parent
      }

      if (e.metaKey || cmdHeld) {
        // Cmd+click → zoom into the clicked node
        const boardPane = getActiveBoardPane(state)
        if (boardPane) saveNavHistoryFromPane(state.setUI, boardPane)
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: targetId, cursorNodeId: targetId })
      } else {
        // Plain click → select the clicked item (sub-item or card)
        state.dispatchBoard({ type: "SELECT", nodeId: targetId })
      }

      e.stopPropagation()
    },
    [nodeId, cmdHeld, storeRef],
  )

  const hoverBorderColor = !isSelected && hovered ? (armed ? "$link" : "$muted") : undefined

  return {
    hovered,
    armed,
    hoverBorderColor,
    handlers: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
    },
  }
}
