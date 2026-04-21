/**
 * Phase 1 of the TEA confidence spike (2026-04-21 dual-pro recommendation).
 *
 * Question being falsified: "Does the silvery apply-chain substrate
 * comfortably wrap km's existing pure applyNavigation reducer, or does
 * the signature flip force shoehorning?"
 *
 * Test: build a pipe(createBaseApp, withTerminalChain, withInputChain,
 * withBoardSpike), dispatch `cursor_down` through `runEventBatch`, and
 * assert the rendered view shows the next node selected and the trace
 * log reflects a clean handled/pass-through decision path.
 */

import { describe, expect, test } from "vitest"

import { pipe } from "@silvery/create/pipe"
import { createBaseApp } from "@silvery/create/runtime/base-app"
import { runEventBatch, type BatchedEvent } from "@silvery/create/runtime/event-loop"
import { withInputChain } from "@silvery/create/runtime/with-input-chain"
import { withTerminalChain } from "@silvery/create/runtime/with-terminal-chain"

import { readTrace, resetTrace } from "./trace.ts"
import { withBoardSpike } from "./with-board-spike.ts"

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function buildSpikeApp() {
  return pipe(
    createBaseApp(),
    withTerminalChain(),
    withInputChain,
    withBoardSpike(),
  )
}

// ---------------------------------------------------------------------------
// Direct dispatch (the fastest falsifier — does the signature flip fit?)
// ---------------------------------------------------------------------------

describe("Phase 1 — direct dispatch into withBoardSpike", () => {
  test("initial render shows cursor on first fake node", () => {
    resetTrace("phase1:initial-render")
    const app = buildSpikeApp()

    expect(app.board.state.cursor).toBe("n1")
    expect(app.board.render()).toBe(
      ["Board (spike):", "> n1", "  n2", "  n3", "  n4", "  n5"].join("\n"),
    )
  })

  test("cursor_down advances cursor + emits render effect", () => {
    resetTrace("phase1:cursor-down")
    const app = buildSpikeApp()

    app.dispatch({ type: "cursor_down" })
    const runnerEffects = app.drainEffects()

    // 1) State update
    expect(app.board.state.cursor).toBe("n2")
    // 2) View reflects it
    expect(app.board.render()).toContain("> n2")
    // 3) Runner sees both the board:SELECT bookkeeping effect and the
    //    render effect — bookkeeping first, render last. This shows the
    //    reducer's native effect shape survived the signature flip.
    expect(runnerEffects.map((e) => e.type)).toEqual(["board:SELECT", "render"])
  })

  test("cursor_up at the top is a no-op (no effects)", () => {
    resetTrace("phase1:cursor-up-top")
    const app = buildSpikeApp()

    app.dispatch({ type: "cursor_up" })
    const runnerEffects = app.drainEffects()

    expect(app.board.state.cursor).toBe("n1")
    // The reducer's noChange path emits [] — the spike still appends
    // render (so the TUI redraws) but no board:* effect leaks.
    expect(runnerEffects.map((e) => e.type)).toEqual(["render"])
  })

  test("trace log is readable — shows op, decision, effects in order", () => {
    resetTrace("phase1:trace-readability")
    const app = buildSpikeApp()

    app.dispatch({ type: "cursor_down" })
    app.dispatch({ type: "cursor_down" })

    const log = readTrace()
    // Each handled op gets a "decision=handled" line; unknown input
    // pass-throughs would show "decision=passed". For two cursor_down
    // dispatches we expect exactly two handled lines from withBoardSpike
    // (terminal/input chains don't see these ops at all because the
    // spike is installed outermost).
    const boardLines = log.split("\n").filter((l) => l.includes("[withBoardSpike]"))
    expect(boardLines).toHaveLength(2)
    for (const line of boardLines) {
      expect(line).toMatch(/op=cursor_down decision=handled effects=board:SELECT, render/)
    }
  })

  test("multiple cursor_down dispatches eventually clamp at last node", () => {
    resetTrace("phase1:clamp-at-end")
    const app = buildSpikeApp()

    for (let i = 0; i < 10; i++) app.dispatch({ type: "cursor_down" })
    const finalEffects = app.drainEffects()

    expect(app.board.state.cursor).toBe("n5")
    // After we hit the end, every subsequent cursor_down is a noChange
    // at the reducer level. The spike still emits a render pulse, so
    // the last effect is simply "render" (no board:SELECT).
    expect(finalEffects[finalEffects.length - 1]).toEqual({ type: "render" })
  })
})

// ---------------------------------------------------------------------------
// Event-loop wiring — proves cursor_down can be invoked via a key event
// translated by the input chain. This is the integration test the
// review explicitly asked for.
// ---------------------------------------------------------------------------

describe("Phase 1 — runEventBatch + keybinding plugin → cursor_down", () => {
  test("'j' key dispatched via keybinding plugin advances cursor through the chain", async () => {
    resetTrace("phase1:event-loop-j")
    const app = buildSpikeApp()

    // Install a tiny keybinding plugin that turns `input:key` with
    // input === "j" into a `dispatch` effect for `cursor_down`.
    //
    // IMPORTANT finding worth noting for the verdict:
    //   `useInput`-style handlers (with-input-chain.ts) have return type
    //   `void | "exit"` — they cannot emit effects. So a km migration
    //   cannot route keys through `useInput` and then call
    //   `app.dispatch(...)` from the handler (reentrant dispatch throws).
    //   The idiomatic substrate shape is: a keybinding PLUGIN that
    //   inspects input:key ops and returns `[{ type:"dispatch", op }]`.
    //
    // That plugin lane is what Phase 2 exercises more thoroughly via
    // withCommandsMinimal.
    const prev = app.apply
    app.apply = (op) => {
      if (op.type === "input:key") {
        const input = (op as { input?: string }).input
        if (input === "j") {
          // Pass through so terminal/input observers still see the key,
          // then re-dispatch the semantic op via the drain queue.
          prev(op)
          return [{ type: "dispatch", op: { type: "cursor_down" } }]
        }
      }
      return prev(op)
    }

    let renderCount = 0
    const batch: BatchedEvent[] = [
      { type: "term:key", input: "j", key: { eventType: "press" } },
    ]
    await runEventBatch(app, batch, {
      onRender: () => {
        renderCount += 1
      },
    })

    expect(app.board.state.cursor).toBe("n2")
    // The cursor_down op emits one render effect per dispatch.
    expect(renderCount).toBe(1)
  })

  test("unhandled keys fall through cleanly (no board mutation, no render)", async () => {
    resetTrace("phase1:unhandled-key")
    const app = buildSpikeApp()

    let renderCount = 0
    const batch: BatchedEvent[] = [
      { type: "term:key", input: "x", key: { eventType: "press" } },
    ]
    await runEventBatch(app, batch, {
      onRender: () => {
        renderCount += 1
      },
    })

    expect(app.board.state.cursor).toBe("n1")
    expect(renderCount).toBe(0)
  })
})
