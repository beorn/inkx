/**
 * Welcome-screen UI stability matrix. Bead:
 * `@km/silvercode/post-resize-ui-stability`.
 *
 * Three cells of the matrix run here — all on the welcome (no-session)
 * screen:
 *
 *   - **initial paint** — startup cascade, asserts ≤ 2 distinct content-
 *     bearing layouts (blank → optional transient → settled). Overlaps in
 *     intent with `welcome-startup-cascade.test.tsx`; this cell is the
 *     stability-helper-driven canary so the matrix is uniform.
 *
 *   - **resize** — drive `term.resize(newCols, newRows)` after the welcome
 *     screen has settled; assert ≤ 1 new distinct layout in the post-event
 *     window. Today's symptom: the post-resize tree shuffles across many
 *     frames before settling.
 *
 *   - **side-panel toggle** — send Ctrl+O while the welcome is settled;
 *     assert ≤ 1 new distinct layout in the post-event window.
 *
 * Each cell uses the real `<App/>` mounted through termless and polls the
 * emulator screen — same harness as `welcome-startup-cascade`. Assertions
 * route through `apps/silvercode/tests/lib/stability.ts`.
 *
 * If a cell is RED, that's the regression evidence. The bead's Phase 3 is
 * to make those cells flip green via targeted fixes.
 */

import type { AgentSession, SessionId } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../src/test/fake-session.ts"
import { installFakes } from "../src/test/fake-boundaries.ts"
import { expectStableLayouts, pollTermlessFrames } from "./lib/stability.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-session-welcome-stability" as SessionId

const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>
type ResizableTerm = TermlessTerm & { resize?: (cols: number, rows: number) => void }
type InputTerm = TermlessTerm & { sendInput?: (data: string) => void }

describe("welcome-screen UI stability (bead @km/silvercode/post-resize-ui-stability)", () => {
  test("initial paint converges to ≤ 2 distinct layouts during startup cascade", async () => {
    const fakes = installFakes({})
    const fake: ScriptedFakeSession = createFakeSession({ sessionId: SESSION })
    using term: TermlessTerm = createTermless({ cols: COLS, rows: ROWS })

    const handle = await run(
      <App
        cwd="/tmp/silvercode-test"
        bare
        layout="single"
        model="claude-sonnet-4-6"
        spawnFactory={() => fake as unknown as AgentSession}
      />,
      term,
    )
    try {
      const frames = await pollTermlessFrames(term, { durationMs: 1500 })
      expect(frames.length, "termless poller never observed any frame").toBeGreaterThan(0)
      expectStableLayouts(frames, {
        label: "welcome.initial-paint",
        kMax: 2,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })

  test("resize converges to a single new layout (no post-resize shuffle)", async () => {
    const fakes = installFakes({})
    const fake: ScriptedFakeSession = createFakeSession({ sessionId: SESSION })
    using term: ResizableTerm = createTermless({ cols: COLS, rows: ROWS }) as ResizableTerm

    const handle = await run(
      <App
        cwd="/tmp/silvercode-test"
        bare
        layout="single"
        model="claude-sonnet-4-6"
        spawnFactory={() => fake as unknown as AgentSession}
      />,
      term,
    )
    try {
      // Let the welcome screen settle. Pre-event frames are discarded;
      // we only measure stability AFTER the resize.
      await settle(1500)

      // Sanity check: emulator received output before the event.
      const screenText = readScreenText(term)
      expect(screenText.length, "termless screen never received output").toBeGreaterThan(0)

      // Drive a real resize through the emulator-backed Term. This calls
      // `emulator.resize`, `size.update`, and fires `resizeListeners` —
      // the same path real SIGWINCH would take. Without a `resize`
      // method on the Term shape something is wrong with the harness.
      expect(typeof term.resize, "termless Term must expose .resize(cols, rows)").toBe("function")
      const newCols = 90
      const newRows = ROWS
      term.resize?.(newCols, newRows)

      // Let the event propagate (one React commit + microtasks). The
      // pre-event fingerprint clears once the new layout paints; we want
      // to measure the *post-event* steady-state, not the transition.
      await settle(150)

      // Window for post-resize stability. ≤ 1 distinct = the resize
      // landed on a single settled layout with no further shuffling. If
      // this fails, the layout is bouncing across multiple commits well
      // after the resize — exactly the bead's symptom.
      const postFrames = await pollTermlessFrames(term, { durationMs: 350 })
      expectStableLayouts(postFrames, {
        label: "welcome.resize",
        kMax: 1,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })

  test("side-panel toggle (Ctrl+O) converges to a single new layout", async () => {
    const fakes = installFakes({})
    const fake: ScriptedFakeSession = createFakeSession({ sessionId: SESSION })
    using term: InputTerm = createTermless({ cols: COLS, rows: ROWS }) as InputTerm

    const handle = await run(
      <App
        cwd="/tmp/silvercode-test"
        bare
        layout="single"
        model="claude-sonnet-4-6"
        spawnFactory={() => fake as unknown as AgentSession}
      />,
      term,
    )
    try {
      await settle(1500)

      // Sanity: the welcome screen rendered.
      const screenText = readScreenText(term)
      expect(screenText.length, "termless screen never received output").toBeGreaterThan(0)

      // Send Ctrl+O — the canonical side-panel toggle in silvercode
      // (App.tsx:754, useInput → togglePanel()). 0x0f === Ctrl+O.
      expect(typeof term.sendInput, "termless Term must expose .sendInput(data)").toBe("function")
      term.sendInput?.("\x0f")

      // Let the toggle propagate, then measure post-event steady-state.
      await settle(150)
      const postFrames = await pollTermlessFrames(term, { durationMs: 350 })
      expectStableLayouts(postFrames, {
        label: "welcome.side-panel-toggle",
        kMax: 1,
      })
    } finally {
      handle.unmount()
      await settle(50)
      fakes.dispose()
    }
  })
})

function readScreenText(term: TermlessTerm): string {
  const screen = term.screen as unknown as {
    text?: string
    getText?: () => string
  } | null
  if (!screen) return ""
  if (typeof screen.getText === "function") return screen.getText()
  return screen.text ?? ""
}
