/**
 * withBoardSpike — an apply-chain fixture for km-style pure navigation.
 *
 * This is the MINIMUM surface that answers the question from the
 * 2026-04-21 dual-pro review: "does the silvery apply-chain shape
 * fit km's existing pure (state, op) -> [state, effects] code, or
 * does it fight it?"
 *
 * ## What it does
 *
 *   - Owns a tiny `BoardSpikeState` in closure (cursor + 5 fake nodes).
 *   - Consumes `cursor_up` / `cursor_down` ops, delegates to a local
 *     list-navigation reducer, updates state, emits a `render` effect.
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
 *   applyOutlineNav(state, direction, ids) -> { state, effects }
 *
 * silvery's shipped shape (apply chain):
 *   apply(op) -> false | Effect[]
 *
 * The translation is mechanical:
 *   1. Plugin captures its own state in closure.
 *   2. apply(op) maps incoming Op -> a navigation direction.
 *   3. Calls the fixture reducer, stores new state, returns effects (with
 *      a `render` effect appended so the view redraws).
 *   4. Unknown ops -> prev(op).
 */

import type { ApplyResult, Effect, Op } from "@silvery/create/types"
import type { BaseApp } from "@silvery/create/runtime/base-app"

import { getTracer } from "./trace.ts"

// ---------------------------------------------------------------------------
// Spike-specific store shape exposed on the app.
// ---------------------------------------------------------------------------

interface BoardSpikeState {
  cursor: string | null
}

interface BoardSpikeEffect {
  type: "SELECT"
  nodeId: string
}

interface BoardSpikeResult {
  state: BoardSpikeState
  effects: BoardSpikeEffect[]
}

/**
 * Local fixture for the narrow km reducer behavior exercised here.
 *
 * The authoritative reducer stays in km. Its existing `Board.apply —
 * OUTLINE_NAV`, `Board.apply — SELECT`, and immutability tests pin every
 * state/effect behavior mirrored below. Keeping this seam local lets the
 * Silvery suite run from a fresh clone without reaching into its consumer.
 */
function applyOutlineNavFixture(
  state: BoardSpikeState,
  direction: "prev" | "next",
  nodeIds: readonly string[],
): BoardSpikeResult {
  const currentIndex = state.cursor === null ? -1 : nodeIds.indexOf(state.cursor)
  if (currentIndex < 0) return { state, effects: [] }

  const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1
  const target = nodeIds[targetIndex]
  if (target === undefined) return { state, effects: [] }

  return {
    state: { ...state, cursor: target },
    effects: [{ type: "SELECT", nodeId: target }],
  }
}

export interface BoardSpikeStore {
  /** The fixture's navigation state — readable for tests and view code. */
  readonly state: BoardSpikeState
  /** Ordered list of 5 fake nodes (stable across the test). */
  readonly nodes: readonly string[]
  /** Render the current state as a plain string (no ANSI). */
  render(): string
}

/** Operation the spike understands. Matches legacy km vocabulary. */
type SpikeOp = { type: "cursor_down" } | { type: "cursor_up" }

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
    let state: BoardSpikeState = { cursor: nodes[0] ?? null }
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

      const direction = op.type === "cursor_down" ? "next" : "prev"
      const { state: nextState, effects: boardEffects } = applyOutlineNavFixture(
        state,
        direction,
        nodes,
      )
      state = nextState

      // Translate BoardEffects into silvery runtime Effects.
      //
      // SELECT is board-internal bookkeeping — in the fixture it is already
      // reflected in `state`, so the only thing the runner needs is a
      // `render` pulse. We still pass it through as a tagged effect so the
      // trace shows what the reducer emitted.
      // Prefix each effect's tag with "board:" — the spike's trace relies
      // on this prefix to distinguish reducer-emitted effects from
      // substrate effects (render, exit, etc.). Keep the payload fields
      // too so debugging the trace can identify which node was selected.
      const runnerEffects: Effect[] = boardEffects.map((eff) => {
        const { type: innerType, ...payload } = eff
        return { type: `board:${innerType}`, payload }
      })
      runnerEffects.push({ type: "render" })

      return t.handled(op, runnerEffects)
    }

    return Object.assign(app, { board: store })
  }
}
