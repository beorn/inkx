/**
 * Card hover and click interaction hook.
 *
 * - Plain hover → faint border highlight
 * - Click → select the card
 * - Cmd+click → zoom into the card (make it the board root)
 * - Cmd+hover → armed state visual (Kitty protocol)
 */

import React, { useCallback } from "react"
import { StoreContext } from "@silvery/tea/create-app"
import { useModifierKeys, useMouseCursor } from "@silvery/ag-react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import type { BoardAppStore } from "../board-app-store.ts"
import { getActiveBoardPane } from "../board-app-store.ts"
import { saveNavHistoryFromPane } from "../keyboard/keyboard-helpers.ts"
import { useNodeStore, useReactive } from "../reactive.ts"

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
  // Centralized hover: per-node reactive signal, debounced at the store level.
  // Only 2 cards re-render per hover change (old clears, new sets).
  const nodeStore = useNodeStore()
  const hovered = useReactive(nodeStore.getOrCreate(nodeId).hovered)
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  const armed = hovered && cmdHeld
  useMouseCursor(armed ? "pointer" : null)

  const storeRef = React.useContext(StoreContext) as import("zustand").StoreApi<BoardAppStore> | null

  const handleMouseEnter = useCallback(() => nodeStore.setHovered(nodeId), [nodeStore, nodeId])
  const handleMouseLeave = useCallback(() => nodeStore.setHovered(null), [nodeStore])

  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      if (!storeRef) return
      const state = storeRef.getState()

      // Find the deepest node with an id under the click target.
      // Sub-items inside cards have id={node.id} — clicking them selects
      // the sub-item, not the card.
      let targetId = nodeId
      let node: typeof e.target | null = e.target
      while (node) {
        const id = (node.props as Record<string, unknown>)?.id
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
        // Pass cardNodeId hint so embedded sub-items resolve to the visual card,
        // not the data model parent (which may be in a different column).
        state.dispatchBoard({ type: "SELECT", nodeId: targetId, cardNodeId: nodeId, cardHintSource: "click" })
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
