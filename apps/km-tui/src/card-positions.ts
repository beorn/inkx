/**
 * Node Layout Registry
 *
 * Tracks measured card positions for visual-position-aware navigation.
 *
 * ## curswantY (h/l navigation)
 * - Stored as vertical midpoint of current card
 * - Target card found by: intersection with card box, or closest
 *
 * ## curswantX (board/column navigation)
 * - Stored as column index when moving up to board level
 * - Used to return to same column when moving down
 */

import { createLogger } from "@beorn/logger"

const log = createLogger("km:tui:layout")

// =============================================================================
// Types
// =============================================================================

/**
 * Measured layout for a rendered node.
 */
export interface NodeLayout {
  /** X position (left edge) */
  x: number
  /** Y position (top edge) */
  y: number
  /** Full card width (measured) */
  cardWidth: number
  /** Full card height (measured) */
  cardHeight: number
  /** Head row Y position (measured) */
  headY?: number
  /** Head row height (measured) */
  headHeight?: number
}

/**
 * Card entry in the registry (combines position info with node ID).
 */
interface CardEntry {
  nodeId: string
  layout: NodeLayout
}

/**
 * Registry of node positions and dimensions.
 * Updated by components as they render via useLayoutEffect.
 */
export interface LayoutRegistry {
  // === Node-level registration ===

  /** Register a node's layout by ID */
  registerNode(nodeId: string, layout: NodeLayout): void

  /** Get a node's layout by ID (throws if not found) */
  getNode(nodeId: string): NodeLayout

  /** Get a node's layout by ID (returns undefined if not found) */
  getNodeOptional(nodeId: string): NodeLayout | undefined

  // === Card-level registration (for column/card index navigation) ===

  /** Register a card's layout by column and card index */
  registerCard(colIndex: number, cardIndex: number, nodeId: string, layout: NodeLayout): void

  /** Update the head layout for a card (called after head row is measured) */
  updateCardHead(colIndex: number, cardIndex: number, headY: number, headHeight: number): void

  /** Remove a card's entry from the registry (called when VirtualList unmounts a card) */
  unregisterCard(colIndex: number, cardIndex: number): void

  /** Find the card in a column closest to a target Y position (throws if no cards registered) */
  findCardAtY(colIndex: number, targetY: number): number

  // === Sticky Y for h/l navigation ===

  /** Set sticky Y position for h/l navigation sequences (head midpoint) */
  setStickyY(y: number): void

  /** Get current sticky Y position (null if not set) */
  getStickyY(): number | null

  /** Clear sticky Y position (called on j/k navigation) */
  clearStickyY(): void

  // === Sticky X for board/column navigation ===

  /** Set sticky X (column index) for board/column navigation */
  setStickyX(colIndex: number): void

  /** Get current sticky X (null if not set) */
  getStickyX(): number | null

  /** Clear sticky X */
  clearStickyX(): void

  // === Visual navigation helpers ===

  /**
   * Find the card in a column closest to targetY (curswantY).
   *
   * Algorithm:
   * 1. If targetY falls inside a card's box, return that card (fast path)
   * 2. Otherwise, find the card whose midpoint (y + cardHeight/2) is closest to targetY
   * 3. Return -1 if targetY is above all cards (land on column header)
   *
   * @see docs/ref/ui.md#curswanty-cross-column-navigation-hl
   * @see getCardMidY - calculates curswantY from source card's title midpoint
   */
  findCardAtYVisual(colIndex: number, targetY: number): number

  /**
   * Find the insertion slot in a column closest to targetY.
   * Slots: 0 = after header, 1 = after card 0, etc.
   * Returns the slot index (0 to cardCount).
   */
  findInsertionSlot(colIndex: number, targetY: number): number

  // === Utilities ===

  /** Clear all positions (call on tree structure change) */
  clear(): void

  /** Dump registry state for debugging */
  dump(): string

  /** Check if any cards are registered for a column */
  hasCardsInColumn(colIndex: number): boolean

  /** Get count of registered cards in a column */
  getCardCount(colIndex: number): number

  // === Deferred navigation (for off-screen columns) ===

  /**
   * Store a deferred navigation request for an off-screen column.
   *
   * When h/l navigation targets a column that's off-screen (no registered
   * cards), the cursor lands on the column header temporarily. Call
   * setDeferredResolve() to attach a callback that fires when
   * registerCard runs for the target column during inkx's Phase 2.7.
   */
  setDeferredNavigation(targetColIndex: number, stickyY: number): void

  /**
   * Attach a resolve callback to the pending deferred navigation.
   *
   * Called from handleHorizontalNav (which has access to dispatchBoard).
   * The callback fires synchronously from registerCard, inside inkx's
   * act() boundary. React captures the resulting state update and
   * flushes it in the doRender loop.
   */
  setDeferredResolve(resolve: (nodeId: string) => void): void
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a layout registry instance.
 * Pass this through context so components and handlers can access it.
 */
export function createLayoutRegistry(): LayoutRegistry {
  // Map: nodeId -> NodeLayout
  const nodeLayouts = new Map<string, NodeLayout>()

  // Deferred navigation (for off-screen columns)
  let deferredNav: { targetColIndex: number; stickyY: number; resolvedNodeId?: string } | null = null
  let deferredResolve: ((nodeId: string) => void) | null = null

  // Map: colIndex -> Map<cardIndex, CardEntry>
  const cardLayouts = new Map<number, Map<number, CardEntry>>()

  // Sticky Y for h/l navigation (head midpoint Y coordinate)
  let stickyY: number | null = null

  // Sticky X for board/column navigation (column index)
  let stickyX: number | null = null

  // Inner implementation of findCardAtYVisual — shared between the public method
  // and registerCard's deferred resolution.
  function findCardAtYVisualImpl(colIndex: number, targetY: number): number {
    const colMap = cardLayouts.get(colIndex)
    if (!colMap || colMap.size === 0) return -1

    // First pass: intersection with card box
    for (const [cardIdx, entry] of colMap) {
      const cardTop = entry.layout.y
      const cardBottom = cardTop + entry.layout.cardHeight
      if (targetY >= cardTop && targetY < cardBottom) return cardIdx
    }

    // Second pass: closest midpoint
    let closestIdx = -1
    let closestDist = Infinity
    for (const [cardIdx, entry] of colMap) {
      const cardMid = entry.layout.y + entry.layout.cardHeight / 2
      const dist = Math.abs(cardMid - targetY)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = cardIdx
      }
    }

    // If above all cards, return -1 for column header
    const firstCard = colMap.get(0)
    if (firstCard && targetY < firstCard.layout.y) return -1

    return closestIdx
  }

  return {
    // === Node-level ===

    registerNode(nodeId: string, layout: NodeLayout): void {
      nodeLayouts.set(nodeId, layout)
      log.debug?.(`registerNode id=${nodeId.slice(-8)} y=${layout.y} size=${layout.cardWidth}x${layout.cardHeight}`)
    },

    getNode(nodeId: string): NodeLayout {
      const layout = nodeLayouts.get(nodeId)
      if (!layout) {
        throw new Error(`Node layout not found: ${nodeId}`)
      }
      return layout
    },

    getNodeOptional(nodeId: string): NodeLayout | undefined {
      return nodeLayouts.get(nodeId)
    },

    // === Card-level ===

    registerCard(colIndex: number, cardIndex: number, nodeId: string, layout: NodeLayout): void {
      let colMap = cardLayouts.get(colIndex)
      if (!colMap) {
        colMap = new Map()
        cardLayouts.set(colIndex, colMap)
      }

      // Preserve existing headY/headHeight if re-registering with new positions
      // (CardLayoutRegistrar fires on screen rect changes, creating fresh layout
      // objects without head measurements that were set by updateCardHead)
      const existing = colMap.get(cardIndex)
      if (existing && existing.nodeId === nodeId) {
        if (layout.headY === undefined && existing.layout.headY !== undefined) {
          layout.headY = existing.layout.headY
          layout.headHeight = existing.layout.headHeight
        }
      }

      colMap.set(cardIndex, { nodeId, layout })

      // Also register by node ID for direct lookup
      nodeLayouts.set(nodeId, layout)

      // Resolve deferred navigation when target column's cards are registered.
      // registerCard fires from inkx's Phase 2.7 (layout subscribers).
      // We resolve on EVERY registerCard for the target column — each call sees
      // more registered cards, producing progressively better Y-matching. React
      // batches all dispatches within the same synchronous pass; the last wins.
      // We track resolvedNodeId to skip duplicate dispatches (prevents infinite
      // re-render loops when the same cards re-register on the next pass).
      if (deferredNav && deferredResolve && deferredNav.targetColIndex === colIndex) {
        const targetCardIdx = findCardAtYVisualImpl(colIndex, deferredNav.stickyY)
        if (targetCardIdx >= 0) {
          const targetEntry = colMap.get(targetCardIdx)
          if (targetEntry && targetEntry.nodeId !== deferredNav.resolvedNodeId) {
            deferredNav.resolvedNodeId = targetEntry.nodeId
            deferredResolve(targetEntry.nodeId)
          }
        }
      }

      log.debug?.(`registerCard col=${colIndex} card=${cardIndex} id=${nodeId.slice(-8)} y=${layout.y}`)
    },

    unregisterCard(colIndex: number, cardIndex: number): void {
      const colMap = cardLayouts.get(colIndex)
      if (colMap) {
        const entry = colMap.get(cardIndex)
        if (entry) {
          nodeLayouts.delete(entry.nodeId)
          colMap.delete(cardIndex)
          log.debug?.(`unregisterCard col=${colIndex} card=${cardIndex} id=${entry.nodeId.slice(-8)}`)
        }
      }
    },

    updateCardHead(colIndex: number, cardIndex: number, headY: number, headHeight: number): void {
      const entry = cardLayouts.get(colIndex)?.get(cardIndex)
      if (entry) {
        entry.layout.headY = headY
        entry.layout.headHeight = headHeight
        log.debug?.(`updateCardHead: col=${colIndex} card=${cardIndex} headY=${headY} headHeight=${headHeight}`)
      }
    },

    findCardAtY(colIndex: number, targetY: number): number {
      const colMap = cardLayouts.get(colIndex)

      if (!colMap || colMap.size === 0) {
        throw new Error(`No cards registered for column ${colIndex}`)
      }

      // Find card whose Y is closest to target
      let closestIdx = 0
      let closestDist = Infinity

      for (const [cardIdx, entry] of colMap) {
        const dist = Math.abs(entry.layout.y - targetY)
        if (dist < closestDist) {
          closestDist = dist
          closestIdx = cardIdx
        }
      }

      log.debug?.(
        `findCardAtY: col=${colIndex} targetY=${targetY} -> card=${closestIdx} (y=${colMap.get(closestIdx)?.layout.y})`,
      )

      return closestIdx
    },

    // === Sticky Y ===

    setStickyY(y: number): void {
      stickyY = y
      log.debug?.(`setStickyY: ${y}`)
    },

    getStickyY(): number | null {
      return stickyY
    },

    clearStickyY(): void {
      if (stickyY !== null) {
        log.debug?.("clearStickyY")
        stickyY = null
      }
      // j/k invalidates any pending deferred h/l correction
      deferredNav = null
      deferredResolve = null
    },

    // === Sticky X ===

    setStickyX(colIndex: number): void {
      stickyX = colIndex
      log.debug?.(`setStickyX: ${colIndex}`)
    },

    getStickyX(): number | null {
      return stickyX
    },

    clearStickyX(): void {
      if (stickyX !== null) {
        log.debug?.("clearStickyX")
        stickyX = null
      }
    },

    // === Visual navigation helpers ===

    findCardAtYVisual(colIndex: number, targetY: number): number {
      const colMap = cardLayouts.get(colIndex)

      if (!colMap || colMap.size === 0) {
        // No cards - return -1 to indicate column header
        log.debug?.(`findCardAtYVisual: col=${colIndex} targetY=${targetY} -> -1 (no cards registered)`)
        return -1
      }

      log.debug?.(`findCardAtYVisual: col=${colIndex} targetY=${targetY} searching ${colMap.size} cards`)

      // First pass: find card whose card box contains targetY (intersection)
      for (const [cardIdx, entry] of colMap) {
        const cardTop = entry.layout.y
        const cardBottom = cardTop + entry.layout.cardHeight
        log.debug?.(`  card[${cardIdx}]: y=${cardTop}-${cardBottom} (height=${entry.layout.cardHeight})`)
        if (targetY >= cardTop && targetY < cardBottom) {
          log.debug?.(
            `findCardAtYVisual: col=${colIndex} targetY=${targetY} -> card=${cardIdx} (intersects y=${cardTop}-${cardBottom})`,
          )
          return cardIdx
        }
      }

      // Second pass: find closest card
      let closestIdx = -1
      let closestDist = Infinity

      for (const [cardIdx, entry] of colMap) {
        const cardTop = entry.layout.y
        const cardBottom = cardTop + entry.layout.cardHeight
        const cardMid = (cardTop + cardBottom) / 2
        const dist = Math.abs(cardMid - targetY)
        if (dist < closestDist) {
          closestDist = dist
          closestIdx = cardIdx
        }
      }

      // If targetY is above all cards, return -1 for column header
      const firstCard = colMap.get(0)
      if (firstCard && targetY < firstCard.layout.y) {
        log.debug?.(`findCardAtYVisual: col=${colIndex} targetY=${targetY} -> header (above all cards)`)
        return -1
      }

      log.debug?.(`findCardAtYVisual: col=${colIndex} targetY=${targetY} -> card=${closestIdx} (closest)`)
      return closestIdx
    },

    findInsertionSlot(colIndex: number, targetY: number): number {
      const colMap = cardLayouts.get(colIndex)

      if (!colMap || colMap.size === 0) {
        // No cards - insert at slot 0 (after header)
        return 0
      }

      // Build sorted list of card boundaries
      const cards = Array.from(colMap.entries()).sort((a, b) => a[0] - b[0])

      // Slot positions are the gaps between cards
      // Slot 0 = before first card (y = first card top)
      // Slot N = after card N-1, before card N (y = card N top)
      // Last slot = after last card (y = last card bottom)

      for (let i = 0; i < cards.length; i++) {
        const cardEntry = cards[i]
        if (!cardEntry) continue
        const [, entry] = cardEntry
        const cardTop = entry.layout.y
        if (targetY < cardTop) {
          log.debug?.(`findInsertionSlot: col=${colIndex} targetY=${targetY} -> slot=${i}`)
          return i
        }
      }

      // targetY is at or below last card - insert after it
      const lastSlot = cards.length
      log.debug?.(`findInsertionSlot: col=${colIndex} targetY=${targetY} -> slot=${lastSlot} (after last)`)
      return lastSlot
    },

    // === Utilities ===

    clear(): void {
      nodeLayouts.clear()
      cardLayouts.clear()
      stickyY = null
      stickyX = null
      deferredNav = null
      deferredResolve = null
      log.debug?.("cleared all layouts")
    },

    hasCardsInColumn(colIndex: number): boolean {
      const colMap = cardLayouts.get(colIndex)
      return colMap !== undefined && colMap.size > 0
    },

    getCardCount(colIndex: number): number {
      return cardLayouts.get(colIndex)?.size ?? 0
    },

    // === Deferred navigation ===

    setDeferredNavigation(targetColIndex: number, targetStickyY: number): void {
      deferredNav = { targetColIndex, stickyY: targetStickyY }
      deferredResolve = null
      log.debug?.(`setDeferredNavigation: col=${targetColIndex} stickyY=${targetStickyY}`)
    },

    setDeferredResolve(resolve: (nodeId: string) => void): void {
      if (deferredNav) {
        deferredResolve = resolve
        log.debug?.(`setDeferredResolve: attached for col=${deferredNav.targetColIndex}`)
      }
    },

    dump(): string {
      const lines: string[] = [`stickyX=${stickyX}, stickyY=${stickyY}`]

      if (cardLayouts.size === 0) {
        lines.push("(no cards registered)")
      } else {
        for (const [colIdx, colMap] of cardLayouts) {
          const entries = Array.from(colMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([cardIdx, entry]) => `${cardIdx}:y${entry.layout.y}:h${entry.layout.cardHeight}`)
            .join(", ")
          lines.push(`col[${colIdx}]: ${entries}`)
        }
      }

      if (nodeLayouts.size > cardLayouts.size) {
        lines.push(`(${nodeLayouts.size} total nodes registered)`)
      }

      return lines.join("\n")
    },
  }
}

// =============================================================================
// Layout Calculation Helpers
// =============================================================================

/**
 * Get the visual midpoint Y for a card's title row (used as curswantY).
 * Returns headY + headHeight/2, where headHeight is always 1 (single title line).
 *
 * For h/l navigation, curswantY is the title midpoint of the source card.
 * Target cards are matched by closest full card midpoint (y + cardHeight/2).
 *
 * @see docs/ref/ui.md#curswanty-cross-column-navigation-hl
 * @see findCardAtYVisual - finds target card with closest midpoint
 */
export function getCardMidY(layout: NodeLayout): number {
  if (layout.headY !== undefined && layout.headHeight !== undefined) {
    return layout.headY + layout.headHeight / 2
  }
  // Theoretically possible on first render before layout callbacks fire,
  // but not yet observed in practice. Throw to surface if it ever happens.
  throw new Error(`getCardMidY: headY/headHeight not registered. Layout: y=${layout.y} cardHeight=${layout.cardHeight}`)
}
