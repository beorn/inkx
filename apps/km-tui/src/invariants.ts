/**
 * Runtime Invariant Checks
 *
 * Validates board state consistency after every action. Catches corruption
 * early instead of silently degrading.
 *
 * Enable crash-on-violation: KM_STRICT=1
 * In non-strict mode: logs violations but does not crash.
 *
 * These invariants run after every dispatchAction in board-app.ts.
 * They check the RESULTING state (after mutations), not the input state.
 */

import { createLogger } from "loggily"
import type { ActionCtx } from "./tui-context.ts"

const log = createLogger("km:invariants")

/** Whether to throw on invariant violations (vs. log-only) */
const isStrict = !!process.env.KM_STRICT

/** Virtual/synthetic node ID prefixes — these nodes don't exist in the repo by design */
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
}

/**
 * Check all invariants against the current state.
 *
 * Called after every action in handleKey/handleMouse.
 * Takes a fresh ActionCtx (rebuilt after mutations).
 *
 * Returns violations found. In strict mode, throws on first violation.
 */
export function checkInvariants(ctx: ActionCtx): InvariantViolation[] {
  const violations: InvariantViolation[] = []

  // 1. Cursor points to a valid, existing node (or is null for empty board)
  // Skip check for virtual/synthetic nodes (__meta__*, __body__*) which are not stored in repo
  if (ctx.cursorNodeId && !isVirtualNodeId(ctx.cursorNodeId)) {
    const cursorNode = ctx.repo.getNode(ctx.cursorNodeId)
    if (!cursorNode) {
      violations.push({
        check: "cursor-exists",
        message: `Cursor points to non-existent node`,
        ids: { cursorNodeId: ctx.cursorNodeId },
      })
    }
  }

  // 2. Cursor node is a descendant of the current root (or IS the root)
  // Skip check for virtual nodes
  if (ctx.cursorNodeId && ctx.rootId && !isVirtualNodeId(ctx.cursorNodeId)) {
    const isDescendant = isDescendantOf(ctx, ctx.cursorNodeId, ctx.rootId)
    if (!isDescendant) {
      violations.push({
        check: "cursor-under-root",
        message: `Cursor node is not a descendant of the board root`,
        ids: { cursorNodeId: ctx.cursorNodeId, rootId: ctx.rootId },
      })
    }
  }

  // 3. inlineEditBlock.nodeId exists in the repo (if editing)
  const editBlock = ctx.ui.inlineEditBlock
  if (editBlock) {
    const editNode = ctx.repo.getNode(editBlock.nodeId)
    if (!editNode) {
      violations.push({
        check: "edit-node-exists",
        message: `Inline edit targets non-existent node`,
        ids: { editNodeId: editBlock.nodeId },
      })
    }
  }

  // 4. Column derivation consistency: every card in columns exists in repo
  // Skip virtual columns (__body__*) and virtual card nodes (__meta__*)
  for (let ci = 0; ci < ctx.columns.length; ci++) {
    const col = ctx.columns[ci]
    if (!col) continue
    // Column header node exists (skip virtual columns)
    if (!col.isVirtual && !isVirtualNodeId(col.node.id)) {
      const colNode = ctx.repo.getNode(col.node.id)
      if (!colNode) {
        violations.push({
          check: "column-node-exists",
          message: `Column ${ci} header references non-existent node`,
          ids: { columnNodeId: col.node.id },
        })
      }
    }
    // Card nodes exist (skip virtual card nodes like __meta__*)
    for (let cdi = 0; cdi < col.cardNodes.length; cdi++) {
      const card = col.cardNodes[cdi]
      if (!card) continue
      if (isVirtualNodeId(card.id)) continue
      const cardNode = ctx.repo.getNode(card.id)
      if (!cardNode) {
        violations.push({
          check: "card-node-exists",
          message: `Card ${ci}:${cdi} references non-existent node`,
          ids: { cardNodeId: card.id, columnNodeId: col.node.id },
        })
      }
    }
  }

  // 5. Multi-selection: all selected node IDs exist in repo
  for (const nodeId of ctx.ui.multiSelected) {
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
  if (ctx.cursorNodeId && ctx.columns.length > 0 && ctx.colIndex >= 0) {
    if (ctx.colIndex >= ctx.columns.length) {
      violations.push({
        check: "colIndex-bounds",
        message: `colIndex ${ctx.colIndex} >= columns.length ${ctx.columns.length}`,
        ids: { cursorNodeId: ctx.cursorNodeId },
      })
    }
    if (ctx.isAtCardLevel && ctx.cardIndex >= 0) {
      const col = ctx.columns[ctx.colIndex]
      if (col && ctx.cardIndex >= col.cardNodes.length) {
        violations.push({
          check: "cardIndex-bounds",
          message: `cardIndex ${ctx.cardIndex} >= column cardNodes.length ${col.cardNodes.length}`,
          ids: { cursorNodeId: ctx.cursorNodeId, columnNodeId: col.node.id },
        })
      }
    }
  }

  // 7. Cursor node exists but is not found in any column (orphan cursor)
  // This catches the "editLevel() returns board/column instead of card" bug.
  // Skip virtual nodes which may not be in standard columns.
  if (ctx.cursorNodeId && ctx.columns.length > 0 && ctx.colIndex < 0 && !isVirtualNodeId(ctx.cursorNodeId)) {
    const cursorNode = ctx.repo.getNode(ctx.cursorNodeId)
    if (cursorNode) {
      // Node exists in repo but not in columns — potential state corruption
      violations.push({
        check: "cursor-in-columns",
        message: `Cursor node exists in repo but not found in any column (colIndex=${ctx.colIndex})`,
        ids: {
          cursorNodeId: ctx.cursorNodeId,
          parentId: cursorNode.parent_id,
          rootId: ctx.rootId,
        },
      })
    }
  }

  // 8. Inline edit node should be resolvable in columns (if editing)
  if (editBlock && ctx.columns.length > 0) {
    const editInIndex = ctx.nodeIndex.has(editBlock.nodeId)
    // Walk parents if not directly in index
    let foundInColumns = editInIndex
    if (!foundInColumns) {
      let current = ctx.repo.getNode(editBlock.nodeId)
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
        ids: { editNodeId: editBlock.nodeId, rootId: ctx.rootId },
      })
    }
  }

  // Report violations
  if (violations.length > 0) {
    for (const v of violations) {
      const idStr = v.ids ? ` ${JSON.stringify(v.ids)}` : ""
      log.error?.(`INVARIANT [${v.check}]: ${v.message}${idStr}`)
    }

    if (isStrict) {
      const first = violations[0]!
      throw new InvariantViolationError(first.check, first.message, first.ids)
    }
  }

  return violations
}

/**
 * Check if nodeId is a descendant of ancestorId (or equal to it).
 * Walks up the parent chain. Stops at 100 iterations to prevent infinite loops.
 */
function isDescendantOf(ctx: ActionCtx, nodeId: string, ancestorId: string): boolean {
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
 * Error thrown when an invariant is violated in strict mode (KM_STRICT=1).
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
