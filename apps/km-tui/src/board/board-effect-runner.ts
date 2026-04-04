/**
 * Board Effect Runner
 *
 * Centralized interpreter for BoardEffect values produced by Board.apply().
 * Each effect type maps to exactly one imperative side effect on ActionCtx.
 *
 * The reducer is pure (state, op) → {state, effects}. This module is the
 * impure boundary that executes those effects against the runtime.
 *
 * See docs/design/tea-state-machines.md for the TEA vision.
 */

import type { OpCtx } from "../tui-context.ts"
import { clearSelection } from "../keyboard/keyboard-helpers.ts"
import { requestRenderFlush } from "./board-actions-edit.ts"
import type { ApplyResult, BoardEffect } from "./board-reducer.ts"
import { defaultNormalize, validateEffects } from "./normalize-plugins.ts"

/** Execute a single repo mutation through the effect pipeline (normalization + validation). */
export function runRepoEffect(ctx: OpCtx, effect: BoardEffect): void {
  const getNode = (id: string) => ctx.repo.getNode(id)
  const effects = defaultNormalize([effect], getNode)
  validateEffects(effects, getNode)
  for (const e of effects) runEffect(ctx, e)
}

/**
 * Execute all effects from a Board.apply() result against the runtime.
 *
 * Effects are normalized (auto-derive title, name) then validated before execution.
 * The normalization pipeline eliminates the class of bugs where callers set
 * content but forget title/name (see /why analysis, commit dff82084).
 */
export function runBoardEffects(ctx: OpCtx, result: ApplyResult): void {
  // Normalize: auto-derive title from content, name from content for outlines
  const getNode = (id: string) => ctx.repo.getNode(id)
  const effects = defaultNormalize(result.effects, getNode)

  // Validate invariants (throws on violation — catch bugs at mutation time)
  validateEffects(effects, getNode)

  for (const effect of effects) {
    runEffect(ctx, effect)
  }
}

/** Execute a single BoardEffect. */
function runEffect(ctx: OpCtx, effect: BoardEffect): void {
  switch (effect.type) {
    // Navigation effects
    case "SELECT":
      ctx.dispatchBoard({ type: "SELECT", nodeId: effect.nodeId })
      break
    case "FOLD_SET":
      ctx.setFoldDepths(effect.depths)
      break
    case "SCROLL_ANCHOR_CLEAR":
      ctx.setUI({ columnScrollAnchor: null })
      break

    // Repo mutation effects
    case "REPO_MOVE_NODE":
      ctx.repo.moveNode(effect.nodeId, effect.newParentId, effect.sortOrder)
      break
    case "REPO_ADD_NODE": {
      const newId = ctx.repo.addNode(effect.parentId, effect.node)
      if (effect.selectAfter) {
        ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
        ctx.sel.text.edit(newId as import("@silvery/selection").ID, 0)
        ctx.textEditHints = { blockIndex: 0 }
      }
      break
    }
    case "REPO_DELETE_NODE":
      ctx.repo.deleteNode(effect.nodeId)
      break
    case "REPO_UPDATE_NODE":
      ctx.repo.updateNode(effect.nodeId, effect.updates)
      break

    // UI effects
    case "INLINE_EDIT":
      ctx.sel.text.edit(effect.nodeId as import("@silvery/selection").ID, 0)
      ctx.textEditHints = { blockIndex: effect.blockIndex }
      break
    case "RENDER_FLUSH":
      requestRenderFlush()
      break
    case "CLEAR_SELECTION":
      clearSelection(ctx)
      break

    // Undo effects
    case "UNDO_SET_CURSOR":
      ctx.undoHandle.setCursor(effect.nodeId)
      break
    case "UNDO_START_BATCH":
      ctx.undoHandle.startBatch(effect.label)
      break
    case "UNDO_END_BATCH":
      ctx.undoHandle.endBatch()
      break

    default: {
      const _exhaustive: never = effect
      throw new Error(`Unhandled BoardEffect: ${(_exhaustive as { type: string }).type}`)
    }
  }
}
