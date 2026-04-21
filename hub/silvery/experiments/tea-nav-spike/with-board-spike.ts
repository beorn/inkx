/**
 * withBoardSpike — a throwaway apply-chain plugin that wraps km's
 * existing pure `applyNavigation` reducer.
 *
 * This is the MINIMUM surface that answers the question from the
 * 2026-04-21 dual-pro review: "does the silvery apply-chain shape
 * fit km's existing pure (state, op) -> [state, effects] code, or
 * does it fight it?"
 *
 * ## What it does
 *
 *   - Owns a tiny `BoardNavState` in closure (cursor + 5 fake nodes).
 *   - Consumes `cursor_up` / `cursor_down` ops, delegates to
 *     `applyNavigation`, updates state, emits a `render` effect.
 *   - Everything else passes through to `prev(op)`.
 *
 * ## What it deliberately does NOT do
 *
 *   - No React, no silvery renderer, no zustand. The "view" is a
 *     string built from closure state — same trick K2.6 proposed so
 *     we can assert the chain works without layering reconciler bugs
 *     on top of substrate bugs.
 *   - No cross-plugin atomicity concerns. The only other plugins in
 *     the pipe are terminal/focus/input observers.
 *
 * ## Signature translation
 *
 * km's native shape (pure):
 *   applyNavigation(state, op) -> { state, effects }
 *
 * silvery's shipped shape (apply chain):
 *   apply(op) -> false | Effect[]
 *
 * The translation is mechanical:
 *   1. Plugin captures its own state in closure.
 *   2. apply(op) maps incoming Op -> BoardNavOp if it recognises it.
 *   3. Calls applyNavigation, stores new state, returns effects (with
 *      a `render` effect appended so the view redraws).
 *   4. Unknown ops -> prev(op).
 */

// The spike imports km's actual production reducer via a relative path
// into the km-tui source tree. This is deliberate: part of the spike's
// purpose is to validate that the silvery apply-chain can wrap km's real
// pure code without modification. If we copied the reducer into the
// spike, we would be testing a hand-massaged version — not the live one.
import {
  applyNavigation,
  createBoardNavState,
  type BoardEffect,
  type BoardNavOp,
  type BoardNavState,
} from "../../../../apps/km-tui/src/board/board-reducer.ts"
import type { ApplyResult, Effect, Op } from "@silvery/create/types"
import type { BaseApp } from "@silvery/create/runtime/base-app"

import { getTracer } from "./trace.ts"

// ---------------------------------------------------------------------------
// Spike-specific store shape exposed on the app.
// ---------------------------------------------------------------------------

export interface BoardSpikeStore {
  /** The underlying BoardNavState — readable for tests and view code. */
  readonly state: BoardNavState
  /** Ordered list of 5 fake nodes (stable across the test). */
  readonly nodes: readonly string[]
  /** Render the current state as a plain string (no ANSI). */
  render(): string
}

/** Operation the spike understands. Matches legacy km vocabulary. */
type SpikeOp =
  | { type: "cursor_down" }
  | { type: "cursor_up" }

function isSpikeOp(op: Op): op is SpikeOp {
  return op.type === "cursor_down" || op.type === "cursor_up"
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export interface WithBoardSpikeOptions {
  /** Override the fake node list (default: 5 nodes). */
  nodes?: readonly string[]
}

export function withBoardSpike(
  options: WithBoardSpikeOptions = {},
): <A extends BaseApp>(app: A) => A & { board: BoardSpikeStore } {
  return <A extends BaseApp>(app: A): A & { board: BoardSpikeStore } => {
    const nodes = options.nodes ?? ["n1", "n2", "n3", "n4", "n5"]
    let state: BoardNavState = createBoardNavState({
      cursor: nodes[0] ?? null,
      rootId: "ROOT",
    })
    const t = getTracer("withBoardSpike")

    const store: BoardSpikeStore = {
      get state() {
        return state
      },
      nodes,
      render() {
        const lines: string[] = ["Board (spike):"]
        for (const id of nodes) {
          const marker = state.cursor === id ? "> " : "  "
          lines.push(`${marker}${id}`)
        }
        return lines.join("\n")
      },
    }

    const prev = app.apply
    app.apply = (op: Op): ApplyResult => {
      if (!isSpikeOp(op)) {
        return t.passed(op, prev(op))
      }

      // Translate spike op -> BoardNavOp. OUTLINE_NAV with "next"/"prev"
      // direction is the cleanest mapping for a linear 5-node list.
      const navOp: BoardNavOp = {
        type: "OUTLINE_NAV",
        direction: op.type === "cursor_down" ? "next" : "prev",
        descendantIds: [...nodes],
      }

      const { state: nextState, effects: boardEffects } = applyNavigation(state, navOp)
      state = nextState

      // Translate BoardEffects into silvery runtime Effects.
      //
      // SELECT / SCROLL_ANCHOR_CLEAR / FOLD_SET are board-internal
      // navigation effects — in the spike they are already reflected in
      // `state`, so the only thing the runner needs is a `render` pulse.
      // We still pass the BoardEffect types through as tagged effects so
      // the trace log shows what the reducer emitted.
      // Prefix each effect's tag with "board:" — the spike's trace relies
      // on this prefix to distinguish reducer-emitted effects from
      // substrate effects (render, exit, etc.). Keep the payload fields
      // too so debugging the trace can identify which node was selected.
      const runnerEffects: Effect[] = boardEffects.map((eff: BoardEffect) => {
        const { type: innerType, ...payload } = eff
        return { type: `board:${innerType}`, payload }
      })
      runnerEffects.push({ type: "render" })

      return t.handled(op, runnerEffects)
    }

    return Object.assign(app, { board: store })
  }
}
