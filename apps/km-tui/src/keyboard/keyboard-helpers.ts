/**
 * Keyboard Handler Helpers
 *
 * Navigation history utilities for keyboard handling.
 */

import type { OpCtx } from "../tui-context.ts"

// =============================================================================
// Navigation History
// =============================================================================

/** Push a new entry to navigation history */
function pushNavHistoryEntry(
  setUI: OpCtx["setUI"],
  rootId: string | null,
  colIndex: number,
  cardIndex: number,
  cursor: string | null = null,
  foldDepths?: Map<string, number>,
): void {
  const entry = {
    rootId,
    colIndex,
    cardIndex,
    cursor,
    foldDepths: foldDepths ? new Map(foldDepths) : undefined,
  }
  setUI((prev) => {
    const h = [...prev.navHistory.slice(0, prev.navHistoryIndex), entry]
    return { navHistory: h, navHistoryIndex: h.length }
  })
}

/** Push nav history from OpCtx (convenience wrapper) */
export function saveNavHistory(ctx: OpCtx): void {
  pushNavHistoryEntry(ctx.setUI, ctx.rootId, ctx.colIndex, ctx.cardIndex, ctx.cursor, ctx.foldDepths)
}

/** Push nav history from pane state (for imperative use outside OpCtx) */
export function saveNavHistoryFromPane(
  setUI: OpCtx["setUI"],
  pane: {
    rootId: string | null
    sel?: { node: { cursor(): unknown } }
    foldDepths: Map<string, number>
  },
): void {
  const cursor = (pane.sel?.node.cursor() as string | null) ?? null
  pushNavHistoryEntry(
    setUI,
    pane.rootId,
    0, // colIndex — derived at render, not available imperatively; unused in restore
    0, // cardIndex — same
    cursor,
    pane.foldDepths,
  )
}
