/**
 * Initial cursor derivation.
 *
 * When the TUI opens fresh on a board (no per-session cursor to restore),
 * we pick a sensible starting cursor from the lens — usually the first card
 * of the first column.
 *
 * For "bare-scope arrival" (e.g. `km view beads` resolving to a directory
 * like `@km/beads`), the depth-1 children ARE the user-facing items (bead
 * files), and depth-2 lands inside an item — too deep. In that case we snap
 * to the first child of the root instead.
 *
 * See bead @km/tui/bare-scope-snap-to-root.
 */

import type { TreeLens } from "@km/board"

export interface ComputeInitialCursorOptions {
  /**
   * When true, snap to the first child of `rootId` (depth-1).
   * When false (default), descend one more level to the first card (depth-2)
   * and fall back to the first column if the column has no cards.
   */
  bareScopeArrival?: boolean
}

/**
 * Derive the initial cursor for a board pane from a lens.
 * Returns null when the root has no children.
 */
export function computeInitialCursor(
  lens: TreeLens,
  rootId: string | null,
  options: ComputeInitialCursorOptions = {},
): string | null {
  if (!rootId) return null
  const colIds = lens.children(rootId)
  const firstColId = colIds[0]
  if (!firstColId) return null
  if (options.bareScopeArrival) return firstColId
  const firstCardId = lens.children(firstColId)[0]
  return firstCardId ?? firstColId
}
