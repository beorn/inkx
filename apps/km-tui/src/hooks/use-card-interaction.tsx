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
import { useModifierKeys, useMouseCursor, H1 } from "@silvery/ag-react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import type { BoardAppStore } from "../board-app-store.ts"
import { getActiveBoardPane } from "../board-app-store.ts"
import { saveNavHistoryFromPane } from "../keyboard/keyboard-helpers.ts"
import { useNodeStore, useReactive } from "../reactive.ts"
import { usePopover } from "../views/Popover.tsx"
import { useRepo } from "../repo-context.tsx"
import { DocContent } from "../views/DetailView.tsx"
import { InlineText, InlineRenderProvider } from "../text/InlineComponents.tsx"
import { getNodeDisplayName } from "../state.ts"

export interface CardInteraction {
  hovered: boolean
  armed: boolean
  hoverBorderColor: string | undefined
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
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  const armed = hovered && cmdHeld
  useMouseCursor(armed ? "pointer" : null)

  const storeRef = React.useContext(StoreContext) as import("zustand").StoreApi<BoardAppStore> | null
  const popover = usePopover()
  const repo = useRepo()

  // Track mouse position for popover anchor
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

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
    // The effect (below) calls popover.cancel() when hovered goes false,
    // cancelling any pending show. The popover's own onMouseLeave handles
    // hiding when the mouse leaves the popover box.
  }, [nodeStore])

  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
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
        const boardPane = getActiveBoardPane(state)
        if (boardPane) saveNavHistoryFromPane(state.setUI, boardPane)
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: targetId, cursorNodeId: targetId })
      } else {
        state.dispatchBoard({ type: "SELECT", nodeId: targetId, cardNodeId: nodeId, cardHintSource: "click" })
      }

      e.stopPropagation()
    },
    [nodeId, cmdHeld, storeRef],
  )

  // Cmd+hover detail popover — lazy render callback.
  // Data fetching (getChildren) happens inside the callback, only when the popover
  // is actually visible (after SHOW_DELAY). The render callback captures nodeId and repo.
  useEffect(() => {
    if (!popover) return
    if (armed) {
      // Cmd held + hovered → show popover (with delay for cold start, instant if already visible)
      popover.show(
        {
          lines: [],
          render: () => {
            const node = repo.getNode(nodeId)
            if (!node) return null
            const children = repo.getChildren(nodeId)
            const title = node.content ?? node.name ?? "(untitled)"
            // Build inline context lazily (not a hook — just data for wikilink resolution)
            const inlineCtx = {
              resolveWikiLink: (target: string) => {
                const resolved = repo.resolveByName?.(target) ?? repo.getNode(target)
                return resolved ? getNodeDisplayName(repo, resolved) : null
              },
              hideFields: true,
            }
            return (
              <InlineRenderProvider value={inlineCtx}>
                <H1 wrap="wrap">
                  <InlineText text={title} />
                </H1>
                {children.length > 0 && <DocContent nodes={children} depth={1} repo={repo} maxExpandDepth={2} />}
              </InlineRenderProvider>
            )
          },
          maxWidth: 55,
        },
        mousePos.current,
      )
    } else if (!armed && !hovered) {
      // Mouse left card AND Cmd released → cancel any pending show timer.
      // Don't call hide() here — handleMouseLeave already started the hide timer.
      // The popover's own onMouseEnter cancels the hide if mouse enters it.
      popover.cancel()
    }
  }, [armed, hovered, popover, repo, nodeId])

  const hoverBorderColor = !isSelected && hovered ? (armed ? "$link" : "$muted") : undefined

  return {
    hovered,
    armed,
    hoverBorderColor,
    handlers: {
      onMouseEnter: handleMouseEnter,
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
    },
  }
}
