/**
 * Card hover and click interaction hook.
 *
 * - Plain hover → faint border highlight
 * - Click → select the card
 * - Cmd+click → zoom into the card (make it the board root)
 * - Cmd+hover → armed state visual + detail popover after delay
 */

import React, { useCallback, useEffect, useRef } from "react"
import { StoreContext } from "@silvery/create/create-app"
import { useModifierKeys, useMouseCursor } from "@silvery/ag-react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { Workspace, type BoardAppStore } from "../state/board-app-store.ts"
import { saveNavHistoryFromPane } from "../keyboard/keyboard-helpers.ts"
import { useNodeStore, useReactive } from "../state/reactive.ts"
import { usePopover } from "../views/Popover.tsx"
import { useRepo } from "../repo-context.tsx"
import { buildNodePopoverContent } from "../views/tree-node-shared.ts"
import { getNodeDisplayName } from "../state.ts"

interface CardInteraction {
  hovered: boolean
  armed: boolean
  hoverBorderColor: string | undefined
  /** Ref to track the card's screen-space bounding box for popover overlap positioning.
   *  Populate via useScreenRectCallback inside the card's Box. */
  cardRectRef: React.MutableRefObject<{ x: number; y: number; width: number; height: number } | null>
  handlers: {
    onMouseEnter: (e: SilveryMouseEvent) => void
    onMouseMove: (e: SilveryMouseEvent) => void
    onMouseLeave: (e: SilveryMouseEvent) => void
    onClick: (e: SilveryMouseEvent) => void
  }
}

export function useCardInteraction(nodeId: string, isSelected: boolean): CardInteraction {
  // Centralized hover: per-node reactive signal, debounced at the store level.
  // Only 2 cards re-render per hover change (old clears, new sets).
  const nodeStore = useNodeStore()
  const hovered = useReactive(nodeStore.getOrCreate(nodeId).hovered)

  // Cmd detection via Kitty keyboard protocol. The store tracks modifier
  // state from all key events, so getSnapshot() returns the current Cmd state
  // immediately — even if Cmd was held before hovering started.
  // Only subscribes when hovered (zero cost for non-hovered cards).
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  const armed = hovered && cmdHeld
  useMouseCursor(armed ? "pointer" : null)

  const storeRef = React.useContext(StoreContext) as
    | import("../state/signal-store.ts").SignalStoreApi<BoardAppStore>
    | null
  const popover = usePopover()
  const repo = useRepo()

  // Track mouse position for popover anchor (fallback for point-based positioning)
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Track the card's screen-space bounding box for overlap positioning.
  // Populated by a useScreenRectCallback registrar rendered inside the card's Box.
  const cardRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  const handleMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY }
      nodeStore.setHovered(nodeId)
    },
    [nodeStore, nodeId],
  )
  const handleMouseMove = useCallback((e: SilveryMouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY }
  }, [])
  const handleMouseLeave = useCallback(() => {
    nodeStore.setHovered(null)
    // The effect (below) calls popover.hide() when hovered goes false,
    // cancelling any pending show. The popover's own onMouseLeave handles
    // hiding when the mouse leaves the popover box.
  }, [nodeStore])

  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      // Skip if a child interactive element (checkbox, link) already handled this event
      if (e.defaultPrevented) return
      if (!storeRef) return
      const state = storeRef.getState()

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
        const boardPane = Workspace.getActiveBoardPane(state)
        if (boardPane) saveNavHistoryFromPane(state.setUI, boardPane)
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: targetId, cursorNodeId: targetId })
      } else {
        state.sel.node.select([targetId as import("@silvery/selection").ID])
      }

      e.stopPropagation()
    },
    [nodeId, cmdHeld, storeRef],
  )

  // Cmd+hover detail popover — lazy render callback.
  // Node lookup happens in the effect; render callback is lazy
  // (getChildren only called when the popover is actually visible after SHOW_DELAY).
  useEffect(() => {
    if (!popover) return
    if (armed) {
      // Cmd held + hovered → show popover (with delay for cold start, instant if already visible)
      const node = repo.getNode(nodeId)
      if (node) {
        // Build resolvers without caching (popover content is transient)
        const resolveWikiLink = (target: string) => {
          const resolved = repo.resolveByName?.(target) ?? repo.getNode(target)
          return resolved ? getNodeDisplayName(repo, resolved) : null
        }
        const resolveWikiLinkId = (target: string) => {
          const resolved = repo.resolveByName?.(target) ?? repo.getNode(target)
          return resolved?.id ?? null
        }
        const resolveBlockRef = (id: string): string | null => {
          if (!id?.trim()) return null
          const resolved = repo.getNode(id)
          return resolved ? getNodeDisplayName(repo, resolved) : null
        }
        const inlineCtx = { resolveWikiLink, resolveWikiLinkId, resolveBlockRef, hideFields: true }
        const anchor = {
          ...mousePos.current,
          cardRect: cardRectRef.current ?? undefined,
        }
        popover.show(buildNodePopoverContent(node, repo, inlineCtx), anchor)
      }
    } else {
      // Cmd released or mouse left → hide the popover.
      // If mouse is still on card (!armed but hovered), Cmd was released — hide.
      // If mouse left card (!armed and !hovered), cancel pending show + start hide.
      popover.hide()
    }
  }, [armed, hovered, popover, repo, nodeId])

  const hoverBorderColor = !isSelected && hovered ? (armed ? "$link" : "$muted") : undefined

  return {
    hovered,
    armed,
    hoverBorderColor,
    cardRectRef,
    handlers: {
      onMouseEnter: handleMouseEnter,
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
    },
  }
}
