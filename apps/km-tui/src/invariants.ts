/**
 * Runtime Invariant Checks
 *
 * Validates board state consistency after every action. Throws on violation —
 * invariant failures are programming errors and must surface immediately.
 *
 * These invariants run after every dispatchAction in board-app.ts.
 * They check the RESULTING state (after mutations), not the input state.
 */

import { createLogger } from "loggily"
import type { OpCtx } from "./tui-context.ts"

const log = createLogger("km:invariants")

/** Virtual/synthetic node ID prefixes — these IDs don't exist in the repo by design.
 *  __meta__* = focusable metadata row testIDs in DetailView (e.g., __meta__Status)
 *  __body__* = virtual body column IDs */
const VIRTUAL_PREFIXES = ["__meta__", "__body__"]

/** Check if a node ID is a synthetic/virtual node (not stored in repo) */
function isVirtualNodeId(nodeId: string): boolean {
  return VIRTUAL_PREFIXES.some((prefix) => nodeId.startsWith(prefix))
}

/** Individual invariant violation */
export interface InvariantViolation {
  /** Which invariant failed */
  check: string
  /** Human-readable description */
  message: string
  /** Relevant IDs for debugging */
  ids?: Record<string, string | null>
  /** If true, the caller can recover from this violation (no throw) */
  recoverable?: boolean
}

/**
 * Check all invariants against the current state.
 *
 * Called after every action in handleKey/handleMouse.
 * Takes a fresh OpCtx (rebuilt after mutations).
 *
 * Throws InvariantViolationError if any violation is found.
 */
export function checkInvariants(ctx: OpCtx): InvariantViolation[] {
  const violations: InvariantViolation[] = []

  // 0. Cursor must not be null on a non-empty board — UNLESS the user has
  // intentionally deselected (sel.kind === "idle"). The invariant guards
  // against stale selection state; an explicit deselect is not stale.
  //
  // Legitimate null-cursor cases:
  //   - Empty board (no columns with real cards)
  //   - Detail pane (virtual metadata columns; pane sel resets on nav)
  //   - Move mode (cursor cleared while dragging)
  //   - Intentional deselect (sel.kind === "idle" — click empty space,
  //     click outside everything, sel.node.select([]))
  const treeColIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []
  const isDetailMode = ctx.ui.viewMode === "detail"
  const isIdle = ctx.sel.kind() === "idle"
  if (!ctx.cursor && !isIdle && treeColIds.length > 0 && !ctx.moveState.active && !isDetailMode) {
    const hasRealCards = treeColIds.some((colId) => {
      if (isVirtualNodeId(colId)) return false
      return ctx.tree.children(colId).some((cardId) => !isVirtualNodeId(cardId))
    })
    if (hasRealCards) {
      violations.push({
        check: "cursor-not-null",
        message: `Cursor is null but board has ${treeColIds.length} columns with real cards. Selection state may be stale.`,
        ids: { rootId: ctx.rootId },
      })
    }
  }

  // 1. Cursor points to a valid, existing node (or is null for empty board)
  // Skip check for virtual/synthetic nodes (__meta__*, __body__*) which are not stored in repo
  if (ctx.cursor && !isVirtualNodeId(ctx.cursor as string)) {
    const cursorNode = ctx.repo.getNode(ctx.cursor as string)
    if (!cursorNode) {
      violations.push({
        check: "cursor-exists",
        message: `Cursor points to non-existent node`,
        ids: { cursor: ctx.cursor },
      })
    }
  }

  // 2. Cursor node is a descendant of the current root (or IS the root).
  // Skip check for virtual nodes.
  //
  // FATAL: when this fires, the cursor points at a node whose parent_id chain
  // doesn't reach the pane's rootId. That's data-layer corruption — either the
  // repo has a broken parent_id pointer (the ghost-writer class that
  // km-storage.move-type-validation closed) or a writer set the cursor without
  // validating against the lens. Both are real bugs that MUST surface loudly
  // so they get hunted and fixed. Auto-recovery here masks them.
  //
  // The plateau answer is km-all.unified-selection: cursor becomes a derived
  // property of (selection, lens), and this check becomes structurally
  // unreachable. Until then, keep it fatal — fire-on-bug is the invariant's
  // intended behavior per km-silvery.selection-focus-plateau.
  if (ctx.cursor && ctx.rootId && !isVirtualNodeId(ctx.cursor as string)) {
    const isDescendant = isDescendantOf(ctx, ctx.cursor as string, ctx.rootId)
    if (!isDescendant) {
      violations.push({
        check: "cursor-under-root",
        message: `Cursor node is not a descendant of the board root`,
        ids: { cursor: ctx.cursor, rootId: ctx.rootId },
      })
    }
  }

  // 3. text editing nodeId exists in the repo (if editing)
  const editText = ctx.sel.text()
  if (editText) {
    const editNode = ctx.repo.getNode(editText.nodeId)
    if (!editNode) {
      violations.push({
        check: "edit-node-exists",
        message: `Inline edit targets non-existent node`,
        ids: { editNodeId: editText.nodeId },
      })
    }
  }

  // 4. Column derivation consistency: every card in tree exists in repo
  // Skip virtual columns (__body__*) and virtual card nodes (__meta__*)
  for (let ci = 0; ci < treeColIds.length; ci++) {
    const colId = treeColIds[ci]!
    // Column header node exists (skip virtual columns)
    if (!isVirtualNodeId(colId)) {
      const colNode = ctx.repo.getNode(colId)
      if (!colNode) {
        violations.push({
          check: "column-node-exists",
          message: `Column ${ci} header references non-existent node`,
          ids: { columnNodeId: colId },
        })
      }
    }
    // Card nodes exist (skip virtual card nodes like __meta__*)
    const cardIds = ctx.tree.children(colId)
    for (let cdi = 0; cdi < cardIds.length; cdi++) {
      const cardId = cardIds[cdi]!
      if (isVirtualNodeId(cardId)) continue
      const cardNode = ctx.repo.getNode(cardId)
      if (!cardNode) {
        violations.push({
          check: "card-node-exists",
          message: `Card ${ci}:${cdi} references non-existent node`,
          ids: { cardNodeId: cardId, columnNodeId: colId },
        })
      }
    }
  }

  // 5. Multi-selection: all selected node IDs exist in repo
  // Skip virtual/synthetic nodes (__body__*, __meta__*) — they're generated
  // at display time and don't exist in the repo.
  for (const nodeId of ctx.selectedIds) {
    if (isVirtualNodeId(nodeId)) continue
    const node = ctx.repo.getNode(nodeId)
    if (!node) {
      violations.push({
        check: "selection-node-exists",
        message: `Multi-selection contains non-existent node`,
        ids: { selectedNodeId: nodeId },
      })
    }
  }

  // 6. Cursor position indices are consistent with columns
  if (ctx.cursor && treeColIds.length > 0 && ctx.colIndex >= 0) {
    if (ctx.colIndex >= treeColIds.length) {
      violations.push({
        check: "colIndex-bounds",
        message: `colIndex ${ctx.colIndex} >= columns.length ${treeColIds.length}`,
        ids: { cursor: ctx.cursor },
      })
    }
    if (ctx.isAtCardLevel && ctx.cardIndex >= 0) {
      const colId = treeColIds[ctx.colIndex]
      const colCardIds = colId ? ctx.tree.children(colId) : []
      if (colId && ctx.cardIndex >= colCardIds.length) {
        // Marked recoverable — same stale-cursor class as cursor-under-root,
        // cursor-visible, cursor-in-walkOrder, cursor-in-columns. The cursor
        // landed on an empty column (e.g. after the Phase 3 heal in
        // board-app.ts falls back to a column when no cards exist).
        // See km-tui.cursor-in-columns-crash.
        violations.push({
          check: "cardIndex-bounds",
          message: `cardIndex ${ctx.cardIndex} >= column cards ${colCardIds.length}`,
          ids: { cursor: ctx.cursor, columnNodeId: colId },
          recoverable: true,
        })
      }
    }
  }

  // 7. Cursor node exists but is not found in any column (orphan cursor).
  // Skip virtual nodes which may not be in standard columns.
  // Skip when cursor IS the root node — that's legitimate "board level" cursor.
  //
  // FATAL: this fires when the cursor is a real repo node but column derivation
  // can't place it — i.e. its parent_id chain doesn't reach any visible column.
  // Same data-corruption class as cursor-under-root. km-storage.move-type-validation
  // closed the ghost-writer path that produced this in 6cda83b22; any future trip
  // is a new writer bug that MUST surface, not be silently healed.
  //
  // Plateau fix: km-all.unified-selection makes this structurally unreachable.
  if (
    ctx.cursor &&
    treeColIds.length > 0 &&
    ctx.colIndex < 0 &&
    !isVirtualNodeId(ctx.cursor as string) &&
    (ctx.cursor as string) !== ctx.rootId
  ) {
    const cursorNode = ctx.repo.getNode(ctx.cursor as string)
    if (cursorNode) {
      // Node exists in repo but not in columns — state corruption
      violations.push({
        check: "cursor-in-columns",
        message: `Cursor node exists in repo but not found in any column (colIndex=${ctx.colIndex})`,
        ids: {
          cursor: ctx.cursor,
          parentId: cursorNode.parent_id,
          rootId: ctx.rootId,
        },
      })
    }
  }

  // 8. Cursor-always-visible: cursor must be in the view tree (not hidden by fold/filter)
  // Skip virtual nodes and root-level cursor.
  // Marked recoverable — same root cause as cursor-under-root (stale cursor).
  // The caller resets cursor to rootId. See km-tui.cursor-under-root-crash.
  if (ctx.cursor && !isVirtualNodeId(ctx.cursor as string) && (ctx.cursor as string) !== ctx.rootId) {
    const inTree = ctx.tree.node(ctx.cursor as string)
    if (!inTree) {
      violations.push({
        check: "cursor-visible",
        message: `Cursor is on a non-visible node (hidden by fold or filter)`,
        ids: {
          cursor: ctx.cursor,
          rootId: ctx.rootId,
        },
        recoverable: true,
      })
    }
  }

  // 9. Inline edit node should be resolvable in columns (if editing)
  // Skip when edit node IS the root — board-level editing is an edge case from fuzz testing.
  // Skip when detail pane is focused — edit node belongs to detail's subtree, not board columns.
  const isDetailFocused = ctx.focusedPaneViewType() === "detail"
  if (editText && treeColIds.length > 0 && editText.nodeId !== ctx.rootId && !isDetailFocused) {
    const editInIndex = ctx.nodeIndex.has(editText.nodeId)
    // Walk parents if not directly in index
    let foundInColumns = editInIndex
    if (!foundInColumns) {
      let current = ctx.repo.getNode(editText.nodeId)
      while (current?.parent_id) {
        if (ctx.nodeIndex.has(current.parent_id)) {
          foundInColumns = true
          break
        }
        current = ctx.repo.getNode(current.parent_id)
      }
    }
    if (!foundInColumns) {
      violations.push({
        check: "edit-node-in-columns",
        message: `Inline edit node is not resolvable in any column`,
        ids: { editNodeId: editText.nodeId, rootId: ctx.rootId },
      })
    }
  }

  // 10. Cursor in walkOrder: if cursor is set, it must be in the view tree.
  // This catches the "cursor fell off the tree" class of bugs from stale lenses.
  // Marked recoverable — same stale-cursor class as cursor-under-root and
  // cursor-visible. The caller resets cursor to rootId.
  // See km-tui.cursor-under-root-crash.
  if (ctx.cursor && !isVirtualNodeId(ctx.cursor as string)) {
    // Check cursor is findable in the ViewTreeProjection
    const cursorInTree = ctx.tree.node(ctx.cursor as string) !== undefined
    if (!cursorInTree && (ctx.cursor as string) !== ctx.rootId) {
      violations.push({
        check: "cursor-in-walkOrder",
        message: `Cursor "${(ctx.cursor as string).slice(-12)}" is not in view tree (walkOrder: ${ctx.tree.walkOrder.length} nodes). The view lens may not include this node.`,
        ids: { cursor: ctx.cursor, rootId: ctx.rootId },
        recoverable: true,
      })
    }
  }

  // 11. Selection root matches pane rootId.
  // After zoom/SET_ROOT, the sel root must be synced. Mismatch → empty walkOrder → cursor null.
  // Marked recoverable — the caller calls sel.root.set(rootId) to re-sync.
  // Reached via omnibox go-to and other nav paths that bypass syncPaneSignals.
  // See km-tui.sel-root-sync-crash.
  if (ctx.rootId) {
    const selRoot = ctx.sel.root.id() as string | null
    if (selRoot && selRoot !== ctx.rootId && !isVirtualNodeId(selRoot)) {
      violations.push({
        check: "sel-root-matches-rootId",
        message: `Selection root "${selRoot}" does not match pane rootId "${ctx.rootId}". Did syncPaneSignals miss sel.root.set()?`,
        ids: { selRoot, rootId: ctx.rootId },
        recoverable: true,
      })
    }
  }

  // 12. viewTree root matches rootId.
  // The ViewTreeProjection should be built for the current rootId.
  // Marked recoverable — same sync-drift class as sel-root-matches-rootId.
  // The heal re-syncs by calling sel.root.set(rootId), which propagates
  // through signals and rebuilds the ViewTreeProjection.
  if (ctx.rootId && ctx.tree.rootId) {
    const treeRootId = ctx.tree.rootId
    if (treeRootId !== ctx.rootId) {
      violations.push({
        check: "viewTree-root-matches",
        message: `ViewTree root "${treeRootId}" does not match pane rootId "${ctx.rootId}". View lens may be stale.`,
        ids: { viewTreeRoot: treeRootId, rootId: ctx.rootId },
        recoverable: true,
      })
    }
  }

  // 13. No duplicate columns: each column node ID should appear at most once.
  {
    const seenColIds = new Set<string>()
    for (const colId of treeColIds) {
      if (isVirtualNodeId(colId)) continue
      if (seenColIds.has(colId)) {
        violations.push({
          check: "no-duplicate-columns",
          message: `Column "${colId}" appears more than once`,
          ids: { columnNodeId: colId },
        })
      }
      seenColIds.add(colId)
    }
  }

  // 14. Move mode consistency: when move is active, source nodes must exist.
  if (ctx.moveState.active && ctx.moveState.sourceNodes) {
    for (const srcId of ctx.moveState.sourceNodes) {
      if (!ctx.repo.getNode(srcId)) {
        violations.push({
          check: "move-source-exists",
          message: `Move mode source node "${srcId}" does not exist in repo`,
          ids: { sourceNodeId: srcId },
        })
      }
    }
  }

  // Log every violation so the full picture is in debug output either way.
  for (const v of violations) {
    const idStr = v.ids ? ` ${JSON.stringify(v.ids)}` : ""
    const severity = v.recoverable ? "RECOVERABLE" : "INVARIANT"
    log.error?.(`${severity} [${v.check}]: ${v.message}${idStr}`)
  }

  // Fatal violations are programming errors — throw immediately.
  // Recoverable violations are returned for the caller to handle (e.g. reset cursor).
  const fatal = violations.filter((v) => !v.recoverable)
  if (fatal.length > 0) {
    const first = fatal[0]!
    throw new InvariantViolationError(first.check, first.message, first.ids)
  }

  return violations
}

/**
 * Check if nodeId is a descendant of ancestorId (or equal to it).
 * Walks up the parent chain. Stops at 100 iterations to prevent infinite loops.
 */
function isDescendantOf(ctx: OpCtx, nodeId: string, ancestorId: string): boolean {
  let current: string | null = nodeId
  let depth = 0
  while (current && depth < 100) {
    if (current === ancestorId) return true
    const node = ctx.repo.getNode(current)
    current = node?.parent_id ?? null
    depth++
  }
  return false
}

/**
 * Error thrown when an invariant is violated.
 * Invariant violations are programming errors — they always throw.
 */
export class InvariantViolationError extends Error {
  readonly check: string
  readonly ids?: Record<string, string | null>

  constructor(check: string, message: string, ids?: Record<string, string | null>) {
    super(`Invariant violation [${check}]: ${message}${ids ? ` ${JSON.stringify(ids)}` : ""}`)
    this.name = "InvariantViolationError"
    this.check = check
    this.ids = ids
  }
}
