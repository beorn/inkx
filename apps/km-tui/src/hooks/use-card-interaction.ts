/**
 * Card hover and click interaction hook.
 *
 * Provides hover tracking + click handlers for cards:
 * - Plain hover → faint highlight (border color change)
 * - Click → select the card
 * - Ctrl+click → navigate/zoom into the card (reliable: SGR protocol reports Ctrl)
 * - Cmd+hover → armed state visual (Kitty protocol only)
 *
 * Why Ctrl not Cmd: Terminal mouse protocol (SGR) reports Ctrl/Alt/Shift but NOT
 * Cmd/Super. metaKey is always false in mouse events. Cmd detection only works via
 * useModifierKeys (keyboard events) which requires Kitty protocol + hover-first flow.
 */

import React, { useCallback, useState } from "react"
import { StoreContext } from "@silvery/term/runtime"
import { useModifierKeys, useMouseCursor } from "@silvery/react"
import type { SilveryMouseEvent } from "@silvery/term/mouse-events"
import type { BoardAppStore } from "../board-app-store.ts"
import { getActiveBoardPane } from "../board-app-store.ts"
import { navigateToNode } from "../navigate-to-node.ts"
import { useRepo } from "../repo-context.tsx"
import { saveNavHistoryFromPane } from "../keyboard/keyboard-helpers.ts"

export interface CardInteraction {
  /** Whether the card is being hovered */
  hovered: boolean
  /** Whether Cmd is held while hovering (armed for navigation) */
  armed: boolean
  /** Border color override for hover/armed state, or undefined for default */
  hoverBorderColor: string | undefined
  /** Mouse event handlers to spread onto the card's outermost Box */
  handlers: {
    onMouseEnter: (e: SilveryMouseEvent) => void
    onMouseLeave: (e: SilveryMouseEvent) => void
    onClick: (e: SilveryMouseEvent) => void
  }
}

/**
 * Hook for card hover and click interaction.
 *
 * @param nodeId - The card's node ID
 * @param isSelected - Whether the card is currently selected (skip hover styling)
 */
export function useCardInteraction(nodeId: string, isSelected: boolean): CardInteraction {
  const [hovered, setHovered] = useState(false)

  // Only subscribe to modifier keys when hovered — zero cost for non-hovered cards
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  const armed = hovered && cmdHeld

  // Pointer cursor when armed (Cmd+hover)
  useMouseCursor(armed ? "pointer" : null)

  const repo = useRepo()
  const storeRef = React.useContext(StoreContext) as import("zustand").StoreApi<BoardAppStore> | null

  const handleMouseEnter = useCallback(() => setHovered(true), [])
  const handleMouseLeave = useCallback(() => setHovered(false), [])

  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      if (!storeRef) return
      const state = storeRef.getState()

      // Ctrl+click from mouse event (reliable), or Cmd from Kitty keyboard tracking
      const navigateModifier = e.ctrlKey || cmdHeld
      if (navigateModifier) {
        // Modifier+click → navigate to node
        const boardPane = getActiveBoardPane(state)
        const rootId = boardPane?.rootId ?? null
        const nav = navigateToNode(nodeId, rootId, repo)
        if (!nav) return

        if (boardPane) saveNavHistoryFromPane(state.setUI, boardPane)

        if (nav.action === "SELECT") {
          state.dispatchBoard({ type: "SELECT", nodeId: nav.cursorTarget })
        } else if (nav.action === "DETAIL_VIEW" && nav.zoomTarget) {
          state.dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget, cursorNodeId: nav.cursorTarget })
          state.openDetailPane()
        } else if (nav.zoomTarget) {
          state.dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget, cursorNodeId: nav.cursorTarget })
        }
      } else {
        // Plain click → select this card
        state.dispatchBoard({ type: "SELECT", nodeId })
      }

      e.stopPropagation()
    },
    [nodeId, cmdHeld, repo, storeRef],
  )

  // Hover border: subtle highlight when hovered but not selected
  // Selected cards keep their selection color, hovered uses a lighter indicator
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
